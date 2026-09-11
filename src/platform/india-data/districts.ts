/**
 * TOOTHLOGY INDIA DATA — districts
 *
 * Country → State/UT (Region) → District. A district is identified by its
 * state and slug (and its Local Government Directory code when known), so the
 * same district can never be created twice under two spellings: names are
 * compared by `placeKey`, against the name and every recorded alias.
 *
 * The complete national list comes from the official LGD district export,
 * loaded with `importDistricts` (API or `scripts/import-districts.mts`). The
 * seed carries Chhattisgarh only.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type Principal } from '../rbac';
import { placeKey, slugify } from './normalize';

type DistrictRow = { id: string; regionId: string; name: string; slug: string; aliases: string[] };

async function regionFor(countryCode: string, stateName: string | null) {
  if (!stateName) return null;
  const key = placeKey(stateName);
  const regions = await db().region.findMany({ where: { countryCode }, select: { id: true, name: true, code: true } });
  return regions.find((r) => placeKey(r.name) === key || (r.code && placeKey(r.code) === key)) ?? null;
}

function matches(district: DistrictRow, key: string): boolean {
  return placeKey(district.name) === key || placeKey(district.slug) === key || district.aliases.some((a) => placeKey(a) === key);
}

/**
 * The district a free-text name refers to, or null. With a state, the match
 * is within that state; without one, only a name that is unique in the
 * country matches — an ambiguous name is not guessed.
 */
export async function matchDistrict(countryCode: string, stateName: string | null, districtName: string | null): Promise<{ id: string; name: string; regionId: string } | null> {
  if (!districtName) return null;
  const key = placeKey(districtName);
  if (!key) return null;
  const region = await regionFor(countryCode, stateName);
  if (stateName && !region) return null;
  const candidates = await db().district.findMany({
    where: { countryCode, isActive: true, ...(region ? { regionId: region.id } : {}) },
    select: { id: true, regionId: true, name: true, slug: true, aliases: true },
  });
  const found = candidates.filter((d) => matches(d, key));
  return found.length === 1 ? { id: found[0]!.id, name: found[0]!.name, regionId: found[0]!.regionId } : null;
}

export const districtImportSchema = z.object({
  countryCode: z.string().length(2).default('IN'),
  rows: z
    .array(
      z.object({
        state: z.string().trim().min(2).max(120),
        district: z.string().trim().min(2).max(120),
        lgdCode: z.string().trim().max(20).optional(),
        aliases: z.array(z.string().trim().min(2).max(120)).max(10).optional(),
      }),
    )
    .min(1)
    .max(2000),
});

/**
 * Create or update districts from an authoritative list. Idempotent: a row is
 * matched by LGD code, then by state + name/alias; a new spelling of an
 * existing district becomes an alias, never a second district.
 */
export async function importDistricts(principal: Principal, raw: z.input<typeof districtImportSchema>, context: { requestId?: string } = {}) {
  if (principal.kind !== 'system' && !can(principal, 'tl.data.geography.manage')) throw errors.forbidden('tl.data.geography.manage');
  const input = districtImportSchema.parse(raw);
  const outcome = { created: 0, updated: 0, unchanged: 0, unknownStates: [] as string[] };

  for (const row of input.rows) {
    const region = await regionFor(input.countryCode, row.state);
    if (!region) {
      if (!outcome.unknownStates.includes(row.state)) outcome.unknownStates.push(row.state);
      continue;
    }
    const key = placeKey(row.district);
    const existing =
      (row.lgdCode ? await db().district.findUnique({ where: { lgdCode: row.lgdCode } }) : null) ??
      (await db().district.findMany({ where: { regionId: region.id } })).find((d) => matches(d, key)) ??
      null;
    const aliases = [...new Set([...(row.aliases ?? []), ...(existing && placeKey(existing.name) !== key ? [row.district] : [])])];

    if (!existing) {
      await db().district.create({
        data: { id: newId('district'), countryCode: input.countryCode, regionId: region.id, name: row.district, slug: slugify(row.district), lgdCode: row.lgdCode ?? null, aliases },
      });
      outcome.created += 1;
      continue;
    }
    const mergedAliases = [...new Set([...existing.aliases, ...aliases])].filter((a) => placeKey(a) !== placeKey(existing.name));
    const changed = (row.lgdCode && existing.lgdCode !== row.lgdCode) || mergedAliases.length !== existing.aliases.length;
    if (!changed) {
      outcome.unchanged += 1;
      continue;
    }
    await db().district.update({ where: { id: existing.id }, data: { lgdCode: row.lgdCode ?? existing.lgdCode, aliases: mergedAliases } });
    outcome.updated += 1;
  }

  await recordAuditEvent({
    action: 'DISTRICTS_IMPORTED',
    actor: isAuthenticated(principal) ? principal.userId : 'system',
    subject: input.countryCode,
    outcome: 'success',
    requestId: context.requestId,
    detail: { created: outcome.created, updated: outcome.updated, unchanged: outcome.unchanged, unknownStates: outcome.unknownStates },
  });
  return outcome;
}

/** Districts of a country, optionally one state, with how much is recorded in each. */
export async function listDistricts(filter: { countryCode?: string; regionId?: string } = {}) {
  const districts = await db().district.findMany({
    where: { countryCode: filter.countryCode ?? 'IN', isActive: true, ...(filter.regionId ? { regionId: filter.regionId } : {}) },
    include: { region: { select: { name: true, code: true } }, _count: { select: { locations: true, extractedRecords: true } } },
    orderBy: [{ region: { name: 'asc' } }, { name: 'asc' }],
  });
  return districts.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    lgdCode: d.lgdCode,
    state: d.region.name,
    stateCode: d.region.code,
    aliases: d.aliases,
    locations: d._count.locations,
    extractedRecords: d._count.extractedRecords,
  }));
}
