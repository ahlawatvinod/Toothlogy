/**
 * TL-PAGE-FACULTY-001 — /faculty/:slug
 *
 * A faculty member's public profile: see AcademicProfileView. A post is
 * shown as faculty at a college only once the college confirmed it.
 */

import type { Metadata } from 'next';
import { AcademicProfileView, academicMetadata } from '@/components/academic/academic-profile-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return academicMetadata('FACULTY', (await params).slug);
}

export default async function FacultyPage({ params }: { params: Promise<{ slug: string }> }) {
  return <AcademicProfileView type="FACULTY" slug={(await params).slug} />;
}
