import { Fragment, isValidElement, type ReactNode, useMemo } from "react";
import { Pressable, type TextStyle, View, type ViewStyle } from "react-native";
import { Renderer, type RendererInterface, useMarkdown } from "react-native-marked";
import { Text } from "@/components/ui/text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { splitTimestamps, type Timestamp } from "@/lib/summary";
import { type Colors, fonts, useColors } from "@/theme";

export type SeekHandler = (ms: number) => void;

export function TimeTag({ label }: { label: string }) {
  return (
    <View className="h-6 justify-center rounded-[6px] bg-secondary px-2">
      <Text className="font-mono text-[12px] text-muted-foreground">{label}</Text>
    </View>
  );
}

export function SeekChip({ seek, onSeek }: { seek: Timestamp; onSeek: SeekHandler }) {
  return (
    <Pressable
      testID={`ts-${seek.ms}`}
      accessibilityRole="button"
      accessibilityLabel={`Play from ${seek.label}`}
      hitSlop={6}
      onPress={() => onSeek(seek.ms)}
      className="active:opacity-60"
    >
      <TimeTag label={seek.label} />
    </Pressable>
  );
}

const TRAILING_PUNCTUATION = /^[\s)\].]*$/;

function flatten(nodes: ReactNode[]): ReactNode[] {
  return nodes.flatMap((n) =>
    isValidElement<{ children?: ReactNode }>(n) && n.type === Fragment
      ? flatten(Array.isArray(n.props.children) ? n.props.children : [n.props.children])
      : [n],
  );
}

const isChip = (n: ReactNode) => isValidElement(n) && n.type === SeekChip;
const isBlock = (n: ReactNode) => isValidElement(n) && n.type === View;

type Options = { onSeek?: SeekHandler; colors: Colors };

class GristRenderer extends Renderer implements RendererInterface {
  constructor(private readonly opts: Options) {
    super();
  }

  private inline(children: ReactNode, style?: TextStyle, extra?: TextStyle) {
    return (
      <Text key={this.getKey()} style={[style, extra]} className="text-[15px] leading-[22px]">
        {children}
      </Text>
    );
  }

  private row(children: ReactNode[]) {
    const flat = flatten(children);
    const chips = flat.filter(isChip);
    const blocks = flat.filter(isBlock);
    const inline = flat.filter((n) => !isChip(n) && !isBlock(n));
    return (
      <View key={this.getKey()} className="flex-1 gap-2">
        {inline.length ? (
          <View className="flex-row items-start gap-2.5">
            <Text className="flex-1 text-[15px] leading-[22px]">{inline}</Text>
            {chips}
          </View>
        ) : (
          chips
        )}
        {blocks}
      </View>
    );
  }

  override text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    if (typeof text !== "string") return <Fragment key={this.getKey()}>{text}</Fragment>;
    const onSeek = this.opts.onSeek;
    if (!onSeek) return this.inline(text, styles);
    const parts = splitTimestamps(text);
    if (parts.length === 1 && typeof parts[0] === "string") return this.inline(text, styles);

    let trailing: Timestamp | null = null;
    const tail = parts.at(-1);
    if (typeof tail === "string" && TRAILING_PUNCTUATION.test(tail)) parts.pop();
    const last = parts.at(-1);
    if (last && typeof last !== "string") {
      trailing = last;
      parts.pop();
      const prev = parts.at(-1);
      if (typeof prev === "string") {
        const trimmed = prev.replace(/[\s([]+$/, "");
        if (trimmed) parts[parts.length - 1] = trimmed;
        else parts.pop();
      }
    }

    const body = parts.map((part, i) =>
      typeof part === "string" ? (
        part
      ) : (
        <Text
          key={i}
          accessibilityRole="link"
          onPress={() => onSeek(part.ms)}
          className="font-mono text-[13px] leading-[22px] text-primary"
        >
          {part.label}
        </Text>
      ),
    );
    return (
      <Fragment key={this.getKey()}>
        {body.length ? this.inline(body, styles) : null}
        {trailing ? <SeekChip key="chip" seek={trailing} onSeek={onSeek} /> : null}
      </Fragment>
    );
  }

  override strong(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.inline(children, styles, { fontFamily: fonts.bold });
  }

  override em(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.inline(children, styles, { fontStyle: "italic" });
  }

  override paragraph(children: ReactNode[], _styles?: ViewStyle): ReactNode {
    return this.row(children);
  }

  override heading(text: string | ReactNode[], _styles?: TextStyle): ReactNode {
    return (
      <Text
        key={this.getKey()}
        className="pt-1 font-jakarta-semibold text-[12px] uppercase tracking-[0.5px] text-subtle-foreground"
      >
        {text}
      </Text>
    );
  }

  override listItem(children: ReactNode[], _styles?: ViewStyle): ReactNode {
    return this.row(children);
  }

  override list(
    ordered: boolean,
    li: ReactNode[],
    _listStyle?: ViewStyle,
    _textStyle?: TextStyle,
    startIndex = 1,
  ): ReactNode {
    return (
      <View key={this.getKey()} className="gap-2.5">
        {li.map((item, i) => (
          <View key={i} className="flex-row items-start gap-2.5">
            {ordered ? (
              <Text className="w-5 font-mono text-[13px] leading-[22px] text-subtle-foreground">
                {startIndex + i}.
              </Text>
            ) : (
              <View
                className="mt-[9px] h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: this.opts.colors.ink3 }}
              />
            )}
            {item}
          </View>
        ))}
      </View>
    );
  }
}

export function Markdown({ value, onSeek }: { value: string; onSeek?: SeekHandler }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const renderer = useMemo(() => new GristRenderer({ onSeek, colors }), [onSeek, colors]);
  const nodes = useMarkdown(value, { renderer, colorScheme });
  return <View className="gap-2.5">{nodes}</View>;
}
