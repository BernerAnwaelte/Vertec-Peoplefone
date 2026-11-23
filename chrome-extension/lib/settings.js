// Standardeinstellungen der Erweiterung (chrome.storage.sync).
export const DEFAULTS = {
  token: '',
  countryCode: '41',
  delayMs: 4000,
  confirmBeforeDial: false,
  // Schweizer Mehrwertdienstnummern (0900/0901/0906) standardmässig gesperrt
  blockedPrefixes: ['+41900', '+41901', '+41906'],
  softphoneUrl: 'https://softphone.peoplefone.com/',
};
