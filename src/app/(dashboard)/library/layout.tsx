import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth';
import { SEED_USER_ID } from '@/lib/currentUser';

// The field library screens are the owner's tool only; everyone else goes back to Learn.
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  if (getSessionUserId() !== SEED_USER_ID) redirect('/plan');
  return <>{children}</>;
}
