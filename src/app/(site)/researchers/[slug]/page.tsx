/**
 * TL-PAGE-RESEARCHER-001 — /researchers/:slug
 *
 * A researcher's public profile: see AcademicProfileView.
 */

import type { Metadata } from 'next';
import { AcademicProfileView, academicMetadata } from '@/components/academic/academic-profile-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return academicMetadata('RESEARCHER', (await params).slug);
}

export default async function ResearcherPage({ params }: { params: Promise<{ slug: string }> }) {
  return <AcademicProfileView type="RESEARCHER" slug={(await params).slug} />;
}
