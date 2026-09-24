/**
 * My models —— 用户自有大模型管理（对齐 Web 用户控制台「绑定 AI 大模型」）。
 * 列表展示 owner.type === 'private' 的模型；点击行进入 /model-form 查看与编辑，
 * 添加走 /model-form（无 id），删除需确认。
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, deleteModel, listModels } from '@/api/client';
import type { Model } from '@/api/types';
import { Icons } from '@/components/Icons';
import { ModelIcon } from '@/components/ModelIcon';
import { Card, EmptyView, GlassNav, IconButton, LoadingView, PrimaryButton } from '@/components/ui';
import { modelLabel } from '@/config';
import { spacing, useTheme, type Theme } from '@/theme';

function ModelRow({ model, onPress, onDelete, divider, t }: { model: Model; onPress: () => void; onDelete: () => void; divider: boolean; t: Theme }) {
  const title = modelLabel(model) || 'Untitled model';
  // 有备注时标题是备注，副标题补充技术模型名；无备注时标题即模型名，不再重复一行
  const hasRemark = !!model.remark?.trim();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: divider ? StyleSheet.hairlineWidth : 0, borderColor: t.line }, pressed && { opacity: 0.55 }]}>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: t.bg4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <ModelIcon model={model.model} size={21} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: t.tx }}>{title}</Text>
        {hasRemark && model.model ? (
          <Text numberOfLines={1} style={{ fontSize: 11.5, color: t.tx3, marginTop: 2, fontFamily: 'monospace' }}>{model.model}</Text>
        ) : null}
      </View>
      <IconButton icon="trash" iconSize={17} size={34} color={t.red} sw={1.8} onPress={onDelete} />
      <Icons.chevron size={16} color={t.tx3} sw={1.9} style={{ marginLeft: -6 }} />
    </Pressable>
  );
}

export default function MyModelsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await listModels();
      setModels(all.filter((m) => m.id && m.owner?.type === 'private'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load. Please try again.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load().finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onDelete = useCallback((m: Model) => {
    const name = modelLabel(m) || 'This model';
    Alert.alert('Delete model', `Delete “${name}”? Tasks using this model will need another model.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteModel(m.id!);
            setModels((list) => list.filter((x) => x.id !== m.id));
            setError(''); // 残留的旧刷新错误不应在删空列表后冒出「Failed to load」空态
          } catch (e) {
            Alert.alert('Delete failed', e instanceof ApiError ? e.message : 'Please try again later');
          }
        },
      },
    ]);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {loading ? (
        <LoadingView label="Loading models…" />
      ) : (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 64, paddingHorizontal: spacing.pad, paddingBottom: insets.bottom + 96 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.tx3} />}
        >
          {models.length === 0 && error ? (
            // 仅在没有可展示数据时才占满错误态；刷新失败但已有列表时保留列表
            <EmptyView icon="alert" title="Failed to load" subtitle={`${error}\nPull down to retry`} />
          ) : models.length === 0 ? (
            <EmptyView title="No custom models yet" subtitle={'Connect your own AI model API\nthen select it when starting a task'} />
          ) : (
            <>
              {error ? (
                <Text style={{ textAlign: 'center', color: t.tx3, fontSize: 12, marginBottom: 10 }}>Refresh failed:{error}</Text>
              ) : null}
              <Card style={{ paddingHorizontal: 15, paddingVertical: 3 }}>
                {models.map((m, i) => (
                  <ModelRow key={m.id} model={m} divider={i !== 0} onPress={() => router.push({ pathname: '/model-form', params: { id: m.id! } })} onDelete={() => onDelete(m)} t={t} />
                ))}
              </Card>
            </>
          )}
        </ScrollView>
      )}

      <GlassNav title="My models" onBack={() => router.back()} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.pad, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.bg }}>
        <PrimaryButton block label="Add model" icon="plus" onPress={() => router.push('/model-form')} />
      </View>
    </View>
  );
}
