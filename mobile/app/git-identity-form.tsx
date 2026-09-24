/**
 * 绑定 / Edit Git account —— 对齐 Web add-identity.tsx 与 edit-identity.tsx。
 *  - 新增（无 id）：选平台 + 填 Access Token/用户名/邮箱/备注，自动带出默认 Base URL。
 *  - 编辑（带 ?id=）：回填该身份；platform / base_url 锁定不可改；用户名/邮箱/备注可改；
 *    Access Token Leave blank to keep unchanged。GitHub App 安装的身份（is_installation_app）隐藏 token 字段。
 * 保存成功后返回，身份列表在 focus 时刷新。
 */
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addGitIdentity, ApiError, listGitIdentities, updateGitIdentity } from '@/api/client';
import type { GitPlatform } from '@/api/types';
import { Icons, providerIcon } from '@/components/Icons';
import { GlassNav, LoadingView, PickerSheet, PrimaryButton, type PickerOption } from '@/components/ui';
import { GIT_PLATFORMS, gitPlatformDef, gitPlatformLabel } from '@/git';
import { spacing, useTheme } from '@/theme';

const TOKEN_DOC_URL = 'https://monkeycode.docs.baizhi.cloud/node/019a95ee-6277-7412-842a-587f25330ae6';

const isValidEmail = (email: string) => /^[a-zA-Z0-9+\-\_\.]+@[0-9a-zA-Z\.-]+$/.test(email);
// 禁止括号、引号等特殊字符（与 Web isValidUsername 一致），允许中文等 Unicode
const isValidUsername = (name: string) => !/[!@#$%\^\&\*\[\]\(\)\<\>'"]/.test(name);

export default function GitIdentityFormScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string; platform?: string }>();
  const editing = !!params.id;

  const [platform, setPlatform] = useState<GitPlatform | ''>((params.platform as GitPlatform) || '');
  const [baseUrl, setBaseUrl] = useState(gitPlatformDef(params.platform)?.defaultBaseUrl || '');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [remark, setRemark] = useState('');
  const [isInstallationApp, setIsInstallationApp] = useState(false); // GitHub App 安装：无需 token
  const [showToken, setShowToken] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [platformPicking, setPlatformPicking] = useState(false);
  const [loading, setLoading] = useState(editing); // 编辑模式先拉取回填
  const [saving, setSaving] = useState(false);

  const leave = useCallback(() => {
    if (!navigation.isFocused()) return;
    if (router.canGoBack()) router.back();
    else router.replace('/git-identities');
  }, [navigation, router]);

  // 编辑模式：从列表取回该身份并回填（platform/base_url/username/email/remark；token 不回填，留空=不改）
  useEffect(() => {
    if (!editing) return;
    let active = true;
    listGitIdentities()
      .then((list) => {
        if (!active) return;
        const it = list.find((x) => x.id === params.id);
        if (!it) {
          Alert.alert('Account not found', 'This Git account may have been removed.');
          leave();
          return;
        }
        setPlatform(it.platform || '');
        setBaseUrl(it.base_url || '');
        setUsername(it.username || '');
        setEmail(it.email || '');
        setRemark(it.remark || '');
        setIsInstallationApp(it.is_installation_app === true);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        Alert.alert('Failed to load', e instanceof ApiError ? e.message : 'Please try again later');
        leave();
      });
    return () => { active = false; };
  }, [editing, params.id, leave]);

  // 选平台（仅新增）：自动填默认地址（地址为空或仍是上一个平台默认值即用户没自定义时覆盖）
  const pickPlatform = useCallback((k: string) => {
    const def = gitPlatformDef(k);
    setPlatformPicking(false);
    if (!def) return;
    setBaseUrl((cur) => {
      const trimmed = cur.trim().replace(/\/+$/, '');
      const prevDefault = gitPlatformDef(platform)?.defaultBaseUrl;
      return trimmed === '' || trimmed === prevDefault ? def.defaultBaseUrl : cur;
    });
    setPlatform(def.key);
  }, [platform]);

  const focusProps = (name: string) => ({ onFocus: () => setFocused(name), onBlur: () => setFocused((f) => (f === name ? null : f)) });
  const fieldStyle = (name: string, disabled?: boolean) => ({
    backgroundColor: disabled ? t.bg4 : t.bg3, borderWidth: 1, borderColor: focused === name ? t.ac : t.line2, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 9, color: disabled ? t.tx3 : t.tx, fontSize: 15,
  });
  const label = (text: string, top = 16) => (
    <Text style={{ fontSize: 13, color: t.tx2, fontWeight: '600', marginTop: top, marginBottom: 8 }}>{text}</Text>
  );

  const platformOptions: PickerOption[] = useMemo(
    () => GIT_PLATFORMS.map((p) => ({ key: p.key, title: p.label, sub: p.defaultBaseUrl, icon: providerIcon(p.key) })),
    [],
  );

  // 编辑态隐藏 token 字段：仅 GitHub App 安装的身份（其余 PAT / OAuth 身份都可改 token）
  const showTokenField = !isInstallationApp;
  const tokenRequired = !editing; // 新增必填；编辑留空=不改

  const onSave = useCallback(async () => {
    if (saving) return;
    if (!platform) { Alert.alert('Notice', 'Select a Git platform'); return; }
    if (!baseUrl.trim()) { Alert.alert('Notice', 'Enter the Git platform URL'); return; }
    if (tokenRequired && showTokenField && !accessToken.trim()) { Alert.alert('Notice', 'Enter an Access Token'); return; }
    if (!username.trim()) { Alert.alert('Notice', 'Enter a username'); return; }
    if (!isValidUsername(username.trim())) { Alert.alert('Notice', 'Username cannot contain brackets, quotes, or other special characters'); return; }
    if (!email.trim()) { Alert.alert('Notice', 'Enter an email address'); return; }
    if (!isValidEmail(email.trim())) { Alert.alert('Notice', 'Enter a valid email address'); return; }

    setSaving(true);
    try {
      if (editing) {
        // 只提交可改字段；token 留空表示不动（不传该字段）
        await updateGitIdentity(params.id!, {
          username: username.trim(),
          email: email.trim(),
          remark: remark.trim(),
          ...(showTokenField && accessToken.trim() ? { access_token: accessToken.trim() } : {}),
        });
      } else {
        await addGitIdentity({
          platform,
          base_url: baseUrl.trim(),
          access_token: accessToken.trim(),
          username: username.trim(),
          email: email.trim(),
          remark: remark.trim() || undefined,
        });
      }
      leave();
    } catch (e) {
      Alert.alert(editing ? 'Save failed' : 'Link failed', e instanceof ApiError ? e.message : 'Please check the information and try again');
    } finally {
      setSaving(false);
    }
  }, [saving, editing, params.id, platform, baseUrl, accessToken, username, email, remark, showTokenField, tokenRequired, leave]);

  const platformDef = gitPlatformDef(platform);
  const PlatIcon = Icons[providerIcon(platform || undefined)] ?? Icons.git;
  // 编辑态锁定平台与地址（对齐 Web edit-identity 的 disabled）
  const lockPlatform = editing;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <LoadingView label="Loading account…" />
        <GlassNav title="Edit Git account" onBack={leave} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingHorizontal: spacing.pad, paddingBottom: insets.bottom + 110 }}
          keyboardShouldPersistTaps="handled"
        >
          {label('Git platform', 0)}
          <Pressable onPress={() => setPlatformPicking(true)} disabled={saving || lockPlatform} style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: lockPlatform ? t.bg4 : t.bg3, borderWidth: 1, borderColor: t.line2,
            borderRadius: 14, paddingHorizontal: 14, height: 50,
          }, pressed && { opacity: 0.7 }]}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: lockPlatform ? t.bg3 : t.bg4, alignItems: 'center', justifyContent: 'center' }}>
              <PlatIcon size={17} color={platform ? t.acTx : t.tx3} sw={1.8} />
            </View>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: platform ? '600' : '400', color: platform ? (lockPlatform ? t.tx2 : t.tx) : t.tx3 }}>
              {platform ? gitPlatformLabel(platform) : 'Select platform'}
            </Text>
            {lockPlatform
              ? <Icons.shield size={15} color={t.tx3} sw={1.8} />
              : <Icons.chevron size={17} color={t.tx3} sw={1.9} style={{ transform: [{ rotate: '90deg' }] }} />}
          </Pressable>

          {label('Git platform URL')}
          <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder={platformDef?.defaultBaseUrl || 'e.g. https://gitlab.com'}
            placeholderTextColor={t.tx3} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!saving && !lockPlatform}
            style={fieldStyle('baseUrl', lockPlatform)} {...focusProps('baseUrl')} />

          {showTokenField ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: t.tx2, fontWeight: '600' }}>Access Token{editing ? <Text style={{ color: t.tx3, fontWeight: '400' }}>(leave blank to keep unchanged)</Text> : null}</Text>
                <Pressable onPress={() => Linking.openURL(TOKEN_DOC_URL).catch(() => undefined)} hitSlop={6} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed && { opacity: 0.6 }]}>
                  <Icons.alert size={13} color={t.tx2} sw={1.8} />
                  <Text style={{ fontSize: 12.5, color: t.tx2, fontWeight: '600' }}>How to get one</Text>
                </Pressable>
              </View>
              <View style={[fieldStyle('token'), { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 6 }]}>
                <TextInput value={accessToken} onChangeText={setAccessToken} placeholder={editing ? 'Leave blank to keep unchanged' : 'Enter an Access Token'} placeholderTextColor={t.tx3}
                  secureTextEntry={!showToken} autoCapitalize="none" autoCorrect={false} editable={!saving}
                  style={{ flex: 1, color: t.tx, fontSize: 15, paddingVertical: Platform.OS === 'ios' ? 13 : 9 }} {...focusProps('token')} />
                <Pressable onPress={() => setShowToken((v) => !v)} hitSlop={8} style={{ padding: 8 }}>
                  {showToken ? <Icons.eyeOff size={19} color={t.tx2} sw={1.8} /> : <Icons.eye size={19} color={t.tx2} sw={1.8} />}
                </Pressable>
              </View>
            </>
          ) : null}

          {label('Username')}
          <TextInput value={username} onChangeText={setUsername} placeholder="Git platform username" placeholderTextColor={t.tx3}
            autoCapitalize="none" autoCorrect={false} editable={!saving} style={fieldStyle('username')} {...focusProps('username')} />

          {label('Email')}
          <TextInput value={email} onChangeText={setEmail} placeholder="Email used for commits" placeholderTextColor={t.tx3}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!saving}
            style={fieldStyle('email')} {...focusProps('email')} />

          {label('Note (optional)')}
          <TextInput value={remark} onChangeText={setRemark} placeholder="For example, “My GitHub”" placeholderTextColor={t.tx3}
            editable={!saving} style={fieldStyle('remark')} {...focusProps('remark')} />

          <Text style={{ color: t.tx3, fontSize: 11.5, marginTop: 14, lineHeight: 17 }}>
            {isInstallationApp
              ? 'This account uses a GitHub App installation. Credentials are managed automatically; no token is required.'
              : 'The token is used to pull and commit code. Use an Access Token with repository read/write permission.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <GlassNav title={editing ? 'Edit Git account' : 'Link Git account'} onBack={leave} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.pad, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.bg }}>
        <PrimaryButton block label={saving ? 'Saving…' : editing ? 'Save changes' : 'Save and link'} icon={saving ? undefined : 'check'} disabled={saving} onPress={onSave} />
      </View>

      <PickerSheet visible={platformPicking} title="Select Git platform" options={platformOptions} selected={platform || undefined}
        onPick={pickPlatform} onClose={() => setPlatformPicking(false)} />
    </View>
  );
}
