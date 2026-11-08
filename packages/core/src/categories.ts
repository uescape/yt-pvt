/** Assignable YouTube video categories (stable ids across regions). */
export const CATEGORIES: ReadonlyArray<{ id: string; name: string }> = [
  { id: '1', name: 'Film & Animation' },
  { id: '2', name: 'Autos & Vehicles' },
  { id: '10', name: 'Music' },
  { id: '15', name: 'Pets & Animals' },
  { id: '17', name: 'Sports' },
  { id: '19', name: 'Travel & Events' },
  { id: '20', name: 'Gaming' },
  { id: '22', name: 'People & Blogs' },
  { id: '23', name: 'Comedy' },
  { id: '24', name: 'Entertainment' },
  { id: '25', name: 'News & Politics' },
  { id: '26', name: 'Howto & Style' },
  { id: '27', name: 'Education' },
  { id: '28', name: 'Science & Technology' },
  { id: '29', name: 'Nonprofits & Activism' },
];

/** "0" is our pseudo-category for the overall trending chart. */
export const TRENDING_ALL = '0';

export function categoryName(id: string): string {
  if (id === TRENDING_ALL) return 'Trending';
  return CATEGORIES.find((c) => c.id === id)?.name ?? `Category ${id}`;
}
