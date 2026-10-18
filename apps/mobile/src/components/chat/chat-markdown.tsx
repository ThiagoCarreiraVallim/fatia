import { Fragment } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { parseChatMarkdown, type ChatInlineToken } from '@fatia/api-client';
import { cn } from '@/components/ui';

/**
 * A resposta do assistente: tokens de `parseChatMarkdown`, nunca HTML. Link só
 * `https:`, aberto no navegador do sistema.
 */

function inline(tokens: ChatInlineToken[], key = ''): React.ReactNode[] {
  return tokens.map((t, i) => {
    const k = `${key}${i}`;
    switch (t.type) {
      case 'text':
        return <Fragment key={k}>{t.text}</Fragment>;
      case 'code':
        return (
          <Text key={k} className="rounded bg-secondary font-mono text-[13px] text-foreground">
            {t.text}
          </Text>
        );
      case 'bold':
        return (
          <Text key={k} className="font-bold">
            {inline(t.children, `${k}-`)}
          </Text>
        );
      case 'italic':
        return (
          <Text key={k} className="italic">
            {inline(t.children, `${k}-`)}
          </Text>
        );
      case 'link':
        return (
          <Text
            key={k}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(t.href)}
            className="font-semibold text-primary underline"
          >
            {inline(t.children, `${k}-`)}
          </Text>
        );
    }
  });
}

const TITULO = { 1: 'text-lg', 2: 'text-base', 3: 'text-sm' } as const;

export function ChatMarkdown({ source }: { source: string }) {
  return (
    <View className="gap-2">
      {parseChatMarkdown(source).map((b, i) => {
        if (b.type === 'heading') {
          return (
            <Text
              key={i}
              accessibilityRole="header"
              className={cn('font-bold text-foreground', TITULO[b.level])}
            >
              {inline(b.children)}
            </Text>
          );
        }
        if (b.type === 'code') {
          return (
            <ScrollView key={i} horizontal className="rounded-lg bg-secondary p-3">
              <Text className="font-mono text-[13px] text-foreground">{b.text}</Text>
            </ScrollView>
          );
        }
        if (b.type === 'list') {
          return (
            <View key={i} className="gap-1">
              {b.items.map((item, j) => (
                <View key={j} className="flex-row gap-2">
                  <Text className="text-[15px] text-foreground">
                    {b.ordered ? `${j + 1}.` : '•'}
                  </Text>
                  <Text className="flex-1 text-[15px] leading-6 text-foreground">
                    {inline(item)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        if (b.type === 'table') {
          return (
            <ScrollView key={i} horizontal>
              <View className="rounded-lg border border-border">
                {[b.header, ...b.rows].map((linha, r) => (
                  <View
                    key={r}
                    className={cn(
                      'flex-row',
                      r > 0 && 'border-t border-border',
                      r === 0 && 'bg-secondary',
                    )}
                  >
                    {linha.map((celula, c) => (
                      <Text
                        key={c}
                        className={cn(
                          'w-32 px-2 py-1.5 text-[13px] text-foreground',
                          r === 0 && 'font-semibold',
                        )}
                      >
                        {inline(celula)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }
        return (
          <Text key={i} className="text-[15px] leading-6 text-foreground">
            {inline(b.children)}
          </Text>
        );
      })}
    </View>
  );
}
