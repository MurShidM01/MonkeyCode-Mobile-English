import { en } from './en';
test('English mobile locale is present', () => {
  expect(en.tabs.tasks).toBe('Tasks');
  expect(en.settings.english).toBe('English');
  expect(en.ai.agree).toBe('Agree and continue');
});
