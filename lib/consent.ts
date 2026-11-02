// DPDP Act 2023 Consent Management

export interface ConsentRecord {
  userId: string;
  dataProcessing: boolean;
  audioRecording: boolean;
  analytics: boolean;
  thirdPartySharing: boolean;
  timestamp: Date;
}

export function validateConsent(consent: ConsentRecord): boolean {
  return consent.dataProcessing === true;
}

export function canProcessAudio(consent: ConsentRecord): boolean {
  return consent.audioRecording === true;
}

export function canShareThirdParty(consent: ConsentRecord): boolean {
  return consent.thirdPartySharing === true;
}
