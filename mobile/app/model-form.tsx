/**
 * 添加 / 编辑自定义模型 —— 对齐 Web 用户控制台「绑定 AI 大模型」表单
 * （frontend/src/components/console/settings/add-model.tsx 与 edit-model.tsx）：
 * 字段、默认值与Save流程一致（Save前先 health-check，通过才落库）。
 * 带 ?id= 参数时为编辑模式：回填该模型全部配置（自有模型接口会返回 base_url/api_key）。
 */
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, checkModelConfig, createModel, listModels, listProviderModels, updateModel } from '@/api/client';
import type { Model, ModelInterfaceType, ProviderModelItem } from '@/api/types';
import { Icons } from '@/components/Icons';
import { GlassNav, LoadingView, PickerSheet, PrimaryButton } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

// 与 Web 端一致：用户自有模型固定走 BaiZhiCloud 渠道
const PROVIDER = 'BaiZhiCloud';
// 默认 API 地址按Interface type区分；用户改过地址后切换Interface type不再覆盖
const DEFAULT_BASE_URLS: Record<ModelInterfaceType, string> = {
  openai_chat: 'https://ai-models.app.baizhi.cloud/api/openai',
  openai_responses: 'https://ai-models.app.baizhi.cloud/api/openai',
  anthropic: 'https://ai-models.app.baizhi.cloud/api/anthropic',
};
const DEFAULT_CONTEXT_LIMIT = '200000';
const DEFAULT_OUTPUT_LIMIT = '32000';

const INTERFACE_OPTIONS: { k: ModelInterfaceType; label: string }[] = [
  { k: 'openai_chat', label: 'OpenAI Chat' },
  { k: 'openai_responses', label: 'OpenAI Responses' },
  { k: 'anthropic', label: 'Anthropic' },
];

// 部分供应商（MiniMax）的 anthropic 端点拉不到 /models，沿用 Web 端的静态列表兜底
const MINIMAX_MODELS: ProviderModelItem[] = ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2'].map((model) => ({ model }));
const STATIC_PROVIDER_MODELS: Record<string, ProviderModelItem[]> = {
  'https://api.minimax.io/v1': MINIMAX_MODELS,
  'https://api.minimax.io/anthropic': MINIMAX_MODELS,
  'https://api.minimaxi.com/v1': MINIMAX_MODELS,
  'https://api.minimaxi.com/anthropic': MINIMAX_MODELS,
};

/** 实际请求端点提示（对齐 Web getModelUrlDescription）。 */
function endpointHint(baseUrl: string, interfaceType: ModelInterfaceType): string {
  let url = baseUrl.trim();
  if (!url) return 'Model API URL is not set';
  if (!/^https?:\/\//.test(url)) return 'Invalid model URL';
  if (!url.endsWith('/')) url += '/';
  switch (interfaceType) {
    case 'openai_responses': return `Request: ${url}responses`;
    case 'openai_chat': return `Request: ${url}chat/completions`;
    case 'anthropic': return `Request: ${url}v1/messages`;
  }
}

function parsePositiveInt(value: string): number | null {
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** 编辑加载时记录的连接字段快照（与表单回填用同一份归一化值，避免两处漂移）。 */
type ConnFields = { provider: string; model: string; base_url: string; api_key: string; interface_type: ModelInterfaceType };

export default function ModelFormScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  // 安全退出：用户已手动关掉本页时不再 pop（异步回调里的 back 会误关下层页面）；
  // 深链直达时栈里没有上一页，回退到列表页
  const leave = useCallback(() => {
    if (!navigation.isFocused()) return;
    if (router.canGoBack()) router.back();
    else router.replace('/models');
  }, [navigation, router]);

  const [loading, setLoading] = useState(editing);
  const [provider, setProvider] = useState(PROVIDER);
  const [interfaceType, setInterfaceType] = useState<ModelInterfaceType>('openai_chat');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS.openai_chat);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(!editing);
  const [model, setModel] = useState('');
  const [remark, setRemark] = useState('');
  const [contextLimit, setContextLimit] = useState(DEFAULT_CONTEXT_LIMIT);
  const [outputLimit, setOutputLimit] = useState(DEFAULT_OUTPUT_LIMIT);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [supportImage, setSupportImage] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<ProviderModelItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState<null | 'Checking model…' | 'Saving…'>(null);

  // 已Save的连接相关字段快照：这五个字段未变时跳过健康Check（Check会真实调用上游模型）
  const loadedConnRef = useRef<ConnFields | null>(null);

  // 编辑模式：从列表接口取回该模型并回填（对齐 Web edit-model 的预填逻辑）
  useEffect(() => {
    if (!editing) return;
    let active = true;
    listModels()
      .then((all) => {
        if (!active) return;
        const m: Model | undefined = all.find((x) => x.id === id);
        if (!m) {
          // 直接返回列表，Alert 仅作通知 —— Android 上弹窗可点外部关闭，
          // 若停留在本页等按钮回调会卡死在加载态
          Alert.alert('Model not found', 'This model may have been deleted.');
          leave();
          return;
        }
        const itf: ModelInterfaceType = m.interface_type || 'openai_chat';
        const conn: ConnFields = {
          provider: m.provider || PROVIDER,
          model: m.model || '',
          base_url: m.base_url || DEFAULT_BASE_URLS[itf],
          api_key: m.api_key || '',
          interface_type: itf,
        };
        setProvider(conn.provider);
        setInterfaceType(conn.interface_type);
        setBaseUrl(conn.base_url);
        setApiKey(conn.api_key);
        setModel(conn.model);
        setRemark(m.remark || '');
        const ctxStr = m.context_limit ? String(m.context_limit) : DEFAULT_CONTEXT_LIMIT;
        const outStr = m.output_limit ? String(m.output_limit) : DEFAULT_OUTPUT_LIMIT;
        const thinking = m.thinking_enabled === true;
        const image = m.support_image === true;
        setContextLimit(ctxStr);
        setOutputLimit(outStr);
        setThinkingEnabled(thinking);
        setSupportImage(image);
        // 高级项有非默认值（默认：思考开、图片关、长度 200000/32000）时自动展开，保证「查看」场景不漏信息
        setAdvanced(ctxStr !== DEFAULT_CONTEXT_LIMIT || outStr !== DEFAULT_OUTPUT_LIMIT || !thinking || image);
        loadedConnRef.current = conn;
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        Alert.alert('Failed to load', e instanceof ApiError ? e.message : 'Please try again later');
        leave();
      });
    return () => { active = false; };
  }, [editing, id, leave]);

  const focusProps = (name: string) => ({ onFocus: () => setFocused(name), onBlur: () => setFocused((f) => (f === name ? null : f)) });
  const fieldStyle = (name: string) => ({
    backgroundColor: t.bg3, borderWidth: 1, borderColor: focused === name ? t.ac : t.line2, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 9, color: t.tx, fontSize: 15,
  });
  const label = (text: string, top = 16) => (
    <Text style={{ fontSize: 13, color: t.tx2, fontWeight: '600', marginTop: top, marginBottom: 8 }}>{text}</Text>
  );

  // 切换Interface type：地址为空或仍是「当前格式」的默认值（用户未自定义）时，跟随切到新格式的默认地址。
  // 只和当前格式的默认值比较 —— 若和所有默认值比较，会把「anthropic 格式 + openai 地址」这类
  // 存量组合在点击任意标签（包括已选中的）时静默改写掉
  const pickInterface = useCallback((k: ModelInterfaceType) => {
    setBaseUrl((u) => {
      const cur = u.trim().replace(/\/+$/, '');
      return cur === '' || cur === DEFAULT_BASE_URLS[interfaceType] ? DEFAULT_BASE_URLS[k] : u;
    });
    setInterfaceType(k);
  }, [interfaceType]);

  const fetchModels = useCallback(async () => {
    if (!apiKey.trim()) { Alert.alert('Notice', 'Enter an API Token first'); return; }
    const url = baseUrl.trim() || DEFAULT_BASE_URLS[interfaceType];
    const preset = STATIC_PROVIDER_MODELS[url];
    if (preset) { setModelOptions(preset); setPickerOpen(true); return; }
    setLoadingModels(true);
    try {
      const models = await listProviderModels({ api_key: apiKey.trim(), base_url: url, provider });
      if (models.length === 0) {
        Alert.alert('No available models found', 'You can enter the model name manually (as required by the provider API).');
      } else {
        setModelOptions(models);
        setPickerOpen(true);
      }
    } catch (e) {
      Alert.alert('Failed to fetch model list', `${e instanceof ApiError ? e.message : 'Network error'}\nYou can enter the model name manually.`);
    } finally {
      setLoadingModels(false);
    }
  }, [apiKey, baseUrl, provider, interfaceType]);

  const pickerOptions = useMemo(
    () => modelOptions.filter((m) => m.model).map((m) => ({ key: m.model!, title: m.model! })),
    [modelOptions],
  );

  const onSave = useCallback(async () => {
    if (saving) return;
    if (!baseUrl.trim()) { Alert.alert('Notice', 'Enter the model API URL'); return; }
    if (!apiKey.trim()) { Alert.alert('Notice', 'Enter API Token'); return; }
    if (!model.trim()) { Alert.alert('Notice', 'Enter or select a model name'); return; }
    const ctx = parsePositiveInt(contextLimit);
    if (ctx === null) { setAdvanced(true); Alert.alert('Notice', 'Context length must be a positive integer'); return; }
    const out = parsePositiveInt(outputLimit);
    if (out === null) { setAdvanced(true); Alert.alert('Notice', 'Output length must be a positive integer'); return; }

    const conn: ConnFields = {
      provider,
      model: model.trim(),
      base_url: baseUrl.trim(),
      api_key: apiKey.trim(),
      interface_type: interfaceType,
    };
    // 编辑时若连接字段都没改（只改了备注/长度/开关），跳过健康Check：
    // Check会真实请求上游模型，纯属性修改不该被上游临时故障拦住
    const loaded = loadedConnRef.current;
    const connChanged = !editing || !loaded ||
      (Object.keys(conn) as (keyof ConnFields)[]).some((k) => conn[k] !== loaded[k]);

    let phase: 'Check' | 'Save' = 'Save';
    try {
      if (connChanged) {
        // 与 Web 端一致：先按配置做健康Check，确认可用再Save
        phase = 'Check';
        setSaving('Checking model…');
        const check = await checkModelConfig(conn);
        if (!check.success) {
          Alert.alert('Model configuration check failed', check.error || 'Check the API URL, token, and model name.');
          return;
        }
        phase = 'Save';
      }
      setSaving('Saving…');
      const req = {
        ...conn,
        remark: remark.trim(),
        context_limit: ctx,
        output_limit: out,
        thinking_enabled: thinkingEnabled,
        support_image: supportImage,
      };
      if (editing) await updateModel(id!, req);
      else await createModel(req);
      leave();
    } catch (e) {
      // 区分阶段：Check阶段的网络异常不该被说成「修改/绑定失败」（此时什么都没改）
      const title = phase === 'Check' ? 'Model check failed' : editing ? 'Failed to update model' : 'Failed to add model';
      Alert.alert(title, e instanceof ApiError ? e.message : 'Please try again later');
    } finally {
      setSaving(null);
    }
  }, [saving, baseUrl, apiKey, model, remark, contextLimit, outputLimit, thinkingEnabled, supportImage, interfaceType, provider, editing, id, leave]);

  const switchRow = (text: string, sub: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg3, borderWidth: 1, borderColor: t.line2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.tx }}>{text}</Text>
        <Text style={{ fontSize: 11.5, color: t.tx3, marginTop: 2 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.ac }} disabled={!!saving} />
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <LoadingView label="Loading model configuration…" />
        <GlassNav title="Edit model" onBack={leave} />
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
          {label('Interface type', 0)}
          <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 12, padding: 3 }}>
            {INTERFACE_OPTIONS.map((o) => {
              const on = interfaceType === o.k;
              return (
                <Pressable key={o.k} disabled={!!saving} onPress={() => pickInterface(o.k)} style={[{ flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.bg2 : 'transparent' }, on && t.shCard]}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? t.tx : t.tx2 }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {label('Model API URL')}
          <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder={DEFAULT_BASE_URLS[interfaceType]} placeholderTextColor={t.tx3}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!saving} style={fieldStyle('baseUrl')} {...focusProps('baseUrl')} />
          <Text style={{ color: t.tx3, fontSize: 11.5, marginTop: 7, fontFamily: 'monospace' }}>{endpointHint(baseUrl, interfaceType)}</Text>

          {label('API Token')}
          <View style={[fieldStyle('apiKey'), { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 6 }]}>
            <TextInput value={apiKey} onChangeText={setApiKey} placeholder="Enter API Token" placeholderTextColor={t.tx3}
              secureTextEntry={!showKey} autoCapitalize="none" autoCorrect={false} editable={!saving}
              style={{ flex: 1, color: t.tx, fontSize: 15, paddingVertical: Platform.OS === 'ios' ? 13 : 9 }} {...focusProps('apiKey')} />
            <Pressable onPress={() => setShowKey((v) => !v)} hitSlop={8} style={{ padding: 8 }}>
              {showKey ? <Icons.eyeOff size={19} color={t.tx2} sw={1.8} /> : <Icons.eye size={19} color={t.tx2} sw={1.8} />}
            </Pressable>
          </View>

          {label('Model name')}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* 与右侧 44 高的按钮同行：固定高度并垂直居中，否则 Android 上 padding 撑出的 ~38 高会让文字偏上 */}
            <TextInput value={model} onChangeText={setModel} placeholder="Provider API model name, e.g. deepseek-chat" placeholderTextColor={t.tx3}
              autoCapitalize="none" autoCorrect={false} editable={!saving}
              style={[fieldStyle('model'), { flex: 1, height: 44, paddingVertical: 0, textAlignVertical: 'center' }]} {...focusProps('model')} />
            <Pressable onPress={fetchModels} disabled={loadingModels || !!saving} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 44, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.acGhost }, (pressed || loadingModels) && { opacity: 0.6 }]}>
              {loadingModels ? <ActivityIndicator size="small" color={t.acTx} /> : <Icons.search size={14} color={t.acTx} sw={2} />}
              <Text style={{ color: t.acTx, fontSize: 13, fontWeight: '700' }}>Fetch list</Text>
            </Pressable>
          </View>
          <Text style={{ color: t.tx3, fontSize: 11.5, marginTop: 7 }}>Enter an API token to fetch available models. If that fails, enter the model name manually.</Text>

          {label('Note (optional)')}
          <TextInput value={remark} onChangeText={setRemark} placeholder="Display name, e.g. “My DeepSeek”" placeholderTextColor={t.tx3}
            editable={!saving} style={fieldStyle('remark')} {...focusProps('remark')} />

          {/* Advanced configuration：上下文/Output length + 思考/图片开关，默认折叠（编辑时有非默认值会自动展开） */}
          <Pressable onPress={() => setAdvanced((v) => !v)} hitSlop={8} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 20, alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}>
            <Text style={{ fontSize: 13, color: t.tx2, fontWeight: '600' }}>Advanced configuration</Text>
            <Icons.chevron size={14} color={t.tx3} sw={2} style={{ transform: [{ rotate: advanced ? '90deg' : '0deg' }] }} />
          </Pressable>

          {advanced ? (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  {label('Context length', 12)}
                  <TextInput value={contextLimit} onChangeText={setContextLimit} keyboardType="number-pad" editable={!saving}
                    placeholder={DEFAULT_CONTEXT_LIMIT} placeholderTextColor={t.tx3} style={fieldStyle('ctx')} {...focusProps('ctx')} />
                </View>
                <View style={{ flex: 1 }}>
                  {label('Output length', 12)}
                  <TextInput value={outputLimit} onChangeText={setOutputLimit} keyboardType="number-pad" editable={!saving}
                    placeholder={DEFAULT_OUTPUT_LIMIT} placeholderTextColor={t.tx3} style={fieldStyle('out')} {...focusProps('out')} />
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                {switchRow('Reasoning / Thinking', 'Enable when the model supports reasoning', thinkingEnabled, setThinkingEnabled)}
                {switchRow('Image input', 'Allow this model to receive image input', supportImage, setSupportImage)}
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <GlassNav title={editing ? 'Edit model' : 'Add model'} onBack={leave} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.pad, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.bg }}>
        <PrimaryButton block label={saving ?? 'Check and save'} icon={saving ? undefined : 'check'} disabled={!!saving} onPress={onSave} />
      </View>

      <PickerSheet
        visible={pickerOpen}
        title="Select model"
        options={pickerOptions}
        selected={model}
        onPick={(k) => { setModel(k); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
