export type Role = 'viewer' | 'uploader' | 'admin';
export type User = {
  id: string;
  email: string;
  role: Role;
  display_name?: string | null;
  preferred_lang?: string | null;
  interests?: string[];
  onboarded?: boolean;
};
export type ArchiveDocument = {
  id: string;
  title: string;
  title_np: string;
  category: string;
  description: string;
  body_html: string;
  body_text: string;
  lang: string;
  script: string;
  orig_author: string;
  orig_author_np: string;
  orig_year: string;
  orig_month: string;
  orig_day: string;
  file_path: string;
  uploaded_by: string;
  created_at: string;
  version: string;
};
export type Note = {
  id: string;
  quote: string;
  note: string;
  client_key?: string;
};
export type Progress = { position: number; version: number };
export type Revision = {
  id: string;
  created_at: string;
  snapshot: ArchiveDocument;
};
export const categories = [
  'सबै',
  'किताब',
  'कागजात',
  'रेकर्ड',
  'पत्रिका',
  'अंश',
  'अन्य',
];
export function canUpload(u: User | null) {
  return u?.role === 'uploader' || u?.role === 'admin';
}
export function canDelete(u: User | null, d: ArchiveDocument) {
  return (
    u?.role === 'admin' ||
    (u?.role === 'uploader' && String(u.id) === String(d.uploaded_by))
  );
}
