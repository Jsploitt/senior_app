import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, Card, EmptyState, Icon, Row, Segmented, Text } from '../../components';
import { SPEC5_AUTH_MAX_MS } from '../../protocol/constants';
import { clearLog, useEventLog } from '../../store/eventLog';
import type { LogEntry } from '../../transport/types';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, shadow, space } from '../../theme/tokens';
import { confirmDestructive } from './confirm';
import { EventRow } from './EventRow';
import { exportCsv } from './exportCsv';
import { percent, resultTitleFromName, seconds } from './format';
import { initLogPersistence } from './logPersistence';
import { LOG_FILTERS, authStats, commandTallies, visibleEntries, type LogFilter } from './stats';

const ms = (v: number | null) => (v === null ? 'n/a' : seconds(v));

export function LogScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { entries } = useEventLog();
  const [filter, setFilter] = useState<LogFilter>('all');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null);

  useEffect(() => {
    void initLogPersistence();
  }, []);

  const shown = useMemo(() => visibleEntries(entries, filter), [entries, filter]);
  const auth = useMemo(() => authStats(entries), [entries]);
  const tallies = useMemo(() => commandTallies(entries), [entries]);

  const breakdown = useMemo(() => Object.entries(tallies.byResult), [tallies]);
  const headline =
    entries.length === 0
      ? 'Nothing recorded yet'
      : `${tallies.sent} command${tallies.sent === 1 ? '' : 's'}: ${tallies.accepted} accepted, ${tallies.rejected} rejected` +
        (auth.p50 === null ? '' : `. Median sign-in ${seconds(auth.p50)}`);

  const share = useCallback(async () => {
    const r = await exportCsv(entries);
    setNotice(
      r.ok
        ? {
            tone: 'positive',
            text: r.via === 'download' ? `Downloaded ${r.filename}` : `Shared ${r.filename}`,
          }
        : { tone: 'critical', text: `Export failed: ${r.reason}` },
    );
  }, [entries]);

  const clear = useCallback(
    () =>
      confirmDestructive(
        'Clear log?',
        `This permanently deletes ${entries.length} events from this phone. Export a CSV first if you need them.`,
        'Clear log',
        () => {
          clearLog();
          setNotice(null);
        },
      ),
    [entries.length],
  );

  const header = (
    <View>
      <Text variant="largeTitle" accessibilityRole="header" style={{ marginBottom: space.l }}>
        Log
      </Text>
      <Segmented
        value={filter}
        options={LOG_FILTERS}
        onChange={setFilter}
        accessibilityLabel="Filter events"
      />
      <Button
        title="Share CSV"
        icon="share-outline"
        variant="filled"
        size="small"
        style={{ marginTop: space.m }}
        disabled={entries.length === 0}
        onPress={share}
        accessibilityHint="Exports the whole log as a CSV file"
        testID="share-csv"
      />
      {notice ? (
        <Banner
          tone={notice.tone}
          icon={notice.tone === 'positive' ? 'checkmark-circle' : 'warning'}
          title={notice.text}
        />
      ) : null}

      <View style={{ marginTop: space.l, marginBottom: space.l }}>
        <Card padded={false} testID="evidence-summary">
          <Pressable
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`Evidence summary. ${headline}`}
            testID="evidence-toggle"
            style={{ flexDirection: 'row', alignItems: 'center', padding: space.l, gap: space.m }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="headline">Evidence summary</Text>
              <Text variant="footnote" color="secondaryLabel" style={{ marginTop: space.xxs }}>
                {headline}
              </Text>
            </View>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="tertiaryLabel" />
          </Pressable>
          {open ? (
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.c.separator }}>
              <Row title="Sign-ins measured" value={String(auth.count)} testID="s5-count" />
              <Row title="Median sign-in time" value={ms(auth.p50)} testID="s5-p50" />
              <Row title="Slowest 5% took" value={ms(auth.p95)} testID="s5-p95" />
              <Row
                title={`Signed in within ${seconds(SPEC5_AUTH_MAX_MS)}`}
                value={auth.withinSpec === null ? 'n/a' : percent(auth.withinSpec)}
                testID="s5-within"
              />
              <Row title="Commands sent" value={String(tallies.sent)} testID="s6-sent" />
              {breakdown.map(([name, n]) => (
                <Row key={name} title={resultTitleFromName(name)} value={String(n)} />
              ))}
              <Text variant="footnote" color="secondaryLabel" style={{ padding: space.l }}>
                Counted on this phone, not a verdict. The official accuracy score is computed on the bench
                from the barrier&apos;s log.
              </Text>
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );

  const footer = (
    <Pressable
      onPress={clear}
      disabled={entries.length === 0}
      accessibilityRole="button"
      accessibilityLabel="Clear log"
      accessibilityHint="Asks for confirmation before deleting every event"
      accessibilityState={{ disabled: entries.length === 0 }}
      testID="clear-log"
      style={({ pressed }) => ({
        alignSelf: 'center',
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: space.l,
        marginTop: space.xl,
        opacity: entries.length === 0 ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Text variant="body" color="critical">
        Clear log
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="log-screen">
      <FlatList<LogEntry>
        data={shown}
        keyExtractor={(e) => String(e.id)}
        ListHeaderComponent={header}
        ListFooterComponent={entries.length ? footer : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="list-outline"
            title={entries.length === 0 ? 'No events yet' : 'No matching events'}
            detail={
              entries.length === 0
                ? 'Connect to the barrier or send a command and events will appear here.'
                : 'Nothing in this log matches the selected filter.'
            }
          />
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              {
                backgroundColor: t.c.surface,
              },
              index === 0 && { borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l },
              index === shown.length - 1 && {
                borderBottomLeftRadius: radius.l,
                borderBottomRightRadius: radius.l,
              },
              index === 0 && index === shown.length - 1 && shadow(t.dark),
            ]}
          >
            <EventRow entry={item} inset={index !== shown.length - 1} />
          </View>
        )}
        contentContainerStyle={{
          paddingHorizontal: space.l,
          paddingTop: insets.top + space.s,
          paddingBottom: space.huge + space.xl,
        }}
      />
    </View>
  );
}
