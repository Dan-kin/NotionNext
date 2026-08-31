/**
 * Preview-only cover art for the first automated editorial candidates.
 *
 * Production keeps reading covers from Notion. These overrides let the user
 * review the exact images in a Vercel Preview before we write them to the two
 * published Notion pages.
 */
const ND_EDITORIAL_COVER_PREVIEW = {
  '3cd5d464-0816-81f5-87f0-c7d5c8b69719':
    'https://www.a4artmuseum.com/wp-content/uploads/2026/04/2027-Opencall%E6%A8%A1%E7%89%88%E6%A8%A1%E7%89%88%E5%BE%AE%E4%BF%A1%E6%8E%A8%E6%96%87%E5%A5%97%E4%BB%B6_%E7%94%BB%E6%9D%BF-1-%E5%89%AF%E6%9C%AC-1920x871.png',
  '3cd5d464-0816-81cb-83e0-f931756e9392':
    'https://www.catacombes.paris.fr/sites/default/files/styles/rebound/public/2026-06/M1104_CAR2023.26.12_002_BD.jpg?h=c1233895&itok=RtASjEVy'
}

export function getNdEditorialCoverPreview(pageId) {
  if (process.env.VERCEL_ENV === 'production') {
    return null
  }
  return ND_EDITORIAL_COVER_PREVIEW[pageId] || null
}
