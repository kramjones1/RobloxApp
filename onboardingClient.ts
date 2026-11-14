import { SUPABASE_ANON_KEY, SUPABASE_URL, getSession, getValidAccessToken } from './supabaseClient';

export type OnboardingProgress = {
  version: number;
  current_step: string;
  completed_steps: string[];
  completed_at: string | null;
  updated_at: string;
};

export async function getOnboardingProgress(): Promise<{ progress?: OnboardingProgress; error?: string }> {
  const token = await getValidAccessToken();
  const user = getSession();
  if (!token || !user?.id) return { error: 'Not authenticated' };
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/onboarding_progress?user_id=eq.${encodeURIComponent(user.id)}&select=version,current_step,completed_steps,completed_at,updated_at&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) return { error: `Could not load onboarding progress (HTTP ${response.status}).` };
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return {};
    return { progress: rows[0] as OnboardingProgress };
  } catch (error: any) {
    return { error: error?.message || 'Could not load onboarding progress.' };
  }
}

export async function saveOnboardingProgress(currentStep: string, completedSteps: string[]): Promise<{ error?: string }> {
  const token = await getValidAccessToken();
  const user = getSession();
  if (!token || !user?.id) return { error: 'Not authenticated' };
  const allowed = new Set(['profile_photo','discover','random_call','conversation','coins','safety','complete']);
  if (!allowed.has(currentStep)) return { error: 'Invalid onboarding step.' };
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/onboarding_progress?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: user.id,
        version: 3,
        current_step: currentStep,
        completed_steps: Array.from(new Set(completedSteps.filter(step => allowed.has(step)))),
        completed_at: currentStep === 'complete' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { error: detail || `Could not save onboarding progress (HTTP ${response.status}).` };
    }
    return {};
  } catch (error: any) {
    return { error: error?.message || 'Could not save onboarding progress.' };
  }
}
