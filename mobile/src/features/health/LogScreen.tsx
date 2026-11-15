import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, EmptyState, Row, Section, Segmented, Text } from '../../components';
import { SPEC5_AUTH_MAX_MS } from '../../protocol/constants';
import { clearLog, useEventLog } from '../../store/eventLog';
import type { LogEntry } from '../../transport/types';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, shadow, space } from '../../theme/tokens';
import { confirmDestructive } from './confirm';
import { EventRow } from './EventRow';
import { exportCsv } from './exportCsv';
import { percent, seconds } from './format';
import { initLogPersistence } from './logPersistence';
import { LOG_FILTERS, authStats, commandTallies, visibleEntries, type LogFilter } from './stats';

const ms = (v: number | null) => (v === null ? 'n/a' : seconds(v));

export function LogScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { entries } = useEventLog();
  const [filter, setFilter] = useState<LogFilter>('all');
  const [notice, setNotice] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(null);

  useEffect(() => {
    void initLogPersistence();
  }, []);

  const shown = useMemo(() => visibleEntries(entries, filter), [entries, filter]);
  const auth = useMemo(() => authStats(entries), [entries]);
  const tallies = useMemo(() => commandTallies(entries), [entries]);

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
      <View style={{ flexDirection: 'row', gap: space.m }}>
        <Button
          title="Share CSV"
          icon="share-outline"
          variant="tinted"
          size="small"
          disabled={entries.length === 0}
          onPress={share}
          accessibilityHint="Exports the whole log as a CSV file"
          testID="share-csv"
        />
        <Button
          title="Clear log"
          icon="trash-outline"
          variant="plain"
          size="small"
          disabled={entries.length === 0}
          onPress={clear}
          testID="clear-log"
        />
      </View>
      {notice ? (
        <Banner
          tone={notice.tone}
          icon={notice.tone === 'positive' ? 'checkmark-circle' : 'warning'}
          title={notice.text}
        />
      ) : null}

      <Section
        title="S5 summary"
        footer={`Phone-measured auth latency against the ${seconds(SPEC5_AUTH_MAX_MS)} reference. Not a verdict.`}
      >
        <Row title="Auth events" value={String(auth.count)} testID="s5-count" />
        <Row title="p50" value={ms(auth.p50)} testID="s5-p50" />
        <Row title="p95" value={ms(auth.p95)} testID="s5-p95" />
        <Row
          title={`At or under ${seconds(SPEC5_AUTH_MAX_MS)}`}
          value={auth.withinSpec === null ? 'n/a' : percent(auth.withinSpec)}
          last
          testID="s5-within"
        />
      </Section>

      <Section title="S6 tallies" footer="Phone-observed; official S6 score from log_parser.py s6.">
        <Row title="Accepted" value={String(tallies.accepted)} testID="s6-accepted" />
        <Row
          title="Rejected"
          value={String(tallies.rejected)}
          testID="s6-rejected"
          last={Object.keys(tallies.byResult).length === 0}
        />
        {Object.entries(tallies.byResult).map(([result, n], i, all) => (
          <Row key={result} title={result} value={String(n)} last={i === all.length - 1} />
        ))}
      </Section>

      <View style={{ marginTop: space.xxl, marginBottom: space.m }}>
        <Segmented
          value={filter}
          options={LOG_FILTERS}
          onChange={setFilter}
          accessibilityLabel="Filter events"
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="log-screen">
      <FlatList<LogEntry>
        data={shown}
        keyExtractor={(e) => String(e.id)}
        ListHeaderComponent={header}
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
                borderBottomWidth: index === shown.length - 1 ? 0 : 0.5,
                borderBottomColor: t.c.separator,
              },
              index === 0 && { borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l },
              index === shown.length - 1 && {
                borderBottomLeftRadius: radius.l,
                borderBottomRightRadius: radius.l,
              },
              index === 0 && index === shown.length - 1 && shadow(t.dark),
            ]}
          >
            <EventRow entry={item} />
          </View>
        )}
        contentContainerStyle={{
          paddingHorizontal: space.l,
          paddingTop: insets.top + space.s,
          paddingBottom: space.huge,
        }}
      />
    </View>
  );
}
