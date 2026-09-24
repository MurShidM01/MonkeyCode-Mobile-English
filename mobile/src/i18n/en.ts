export const en = {
  common: {
    loading: 'Loading…', save: 'Save', cancel: 'Cancel', close: 'Close', back: 'Back', done: 'Done',
    retry: 'Retry', confirm: 'Confirm', continue: 'Continue', search: 'Search', delete: 'Delete',
    edit: 'Edit', add: 'Add', later: 'Later', restartNow: 'Restart now',
  },
  tabs: { tasks: 'Tasks', projects: 'Projects', profile: 'Profile' },
  settings: { appearance: 'Appearance', theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark', accent: 'Accent color', language: 'Language', english: 'English' },
  auth: {
    signIn: 'Sign in', email: 'Email', password: 'Password', phone: 'Phone', verificationCode: 'Verification code',
    sendCode: 'Send code', invalidPhone: 'Please enter a valid phone number', enterEmailPassword: 'Please enter your email and password',
    loginFailed: 'Sign-in failed. Please try again.', loading: 'Loading…',
  },
  ai: {
    title: 'Use AI Coding Assistant',
    body: 'To provide AI coding assistance, content you submit in tasks (including prompts, code, files, and images) may be sent to AI models and third-party AI service providers for processing.',
    privacy: 'View Privacy Policy', agree: 'Agree and continue', decline: 'Not now',
  },
  model: {
    interfaceType: 'Interface type', apiUrl: 'Model API URL', token: 'API Token', modelName: 'Model name',
    fetchList: 'Fetch list', note: 'Note (optional)', advanced: 'Advanced configuration',
    contextLength: 'Context length', outputLength: 'Output length', reasoning: 'Reasoning / Thinking',
    reasoningSub: 'Enable when supported by the model', imageInput: 'Image input',
    imageInputSub: 'Allow this model to receive image input', addTitle: 'Add model', editTitle: 'Edit model',
  },
  updates: {
    available: 'Update available',
    downloaded: 'The update has been downloaded. Restart the app to apply it.',
    failed: 'Update failed', failedMessage: 'Download failed. Check your network connection and try again.',
  },
} as const;
