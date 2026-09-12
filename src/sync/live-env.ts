export function assertLiveReadOnlyEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.COVENANT_FAKE_PORTS === '1') {
    throw new Error('sync-once requires the live simulator. Unset COVENANT_FAKE_PORTS.')
  }
  if (env.COVENANT_RECORDED_REPLAY === '1') {
    throw new Error('sync-once requires the live simulator. Unset COVENANT_RECORDED_REPLAY.')
  }
  if (!env.ANIMA_SIM_API_KEY) {
    throw new Error('ANIMA_SIM_API_KEY is empty. Populate .env.local before running sync.')
  }
}

export function isSyntheticPatientId(patientId: string): boolean {
  return patientId.startsWith('SIM-')
}
