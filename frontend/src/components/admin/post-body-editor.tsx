"use client"

import { $createCodeNode, $isCodeNode, CodeHighlightNode, CodeNode } from "@lexical/code"
import { $createLinkNode, $isLinkNode, $toggleLink, LinkNode } from "@lexical/link"
import {
  $insertList,
  $isListNode,
  $removeList,
  ListItemNode,
  ListNode,
  type ListType,
} from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  UNORDERED_LIST,
  type TextMatchTransformer,
  type Transformer,
} from "@lexical/markdown"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  $insertNodeToNearestRoot,
  mergeRegister,
} from "@lexical/utils"
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  DecoratorNode,
  REDO_COMMAND,
  TextNode,
  UNDO_COMMAND,
  type DOMExportOutput,
  type EditorConfig,
  type EditorThemeClasses,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import {
  Bold,
  Check,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Redo2,
  SquareCode,
  TriangleAlert,
  Undo2,
  Unlink,
} from "lucide-react"
import { useEffect, useImperativeHandle, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/* ---------- URL safety ---------- */

const HTTP_SCHEMES: readonly string[] = ["http", "https"]
const LINK_SCHEMES: readonly string[] = ["http", "https", "mailto", "tel"]

/**
 * Returns a URL that is safe to place in a Markdown destination, or null when it is unsafe.
 * Explicit schemes outside `allowedSchemes` and HTML character references are rejected;
 * characters that could terminate or alter a Markdown destination are percent-encoded.
 */
export function markdownSafeUrl(
  raw: string,
  allowedSchemes: readonly string[] = HTTP_SCHEMES
): string | null {
  const value = raw.trim()
  if (value === "") return null
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  if (scheme && !allowedSchemes.includes((scheme[1] ?? "").toLowerCase())) return null
  // Markdown decodes character references in destinations, which could hide a scheme.
  if (/&(?:#x?[0-9a-f]+|[a-z][a-z0-9]*);/i.test(value)) return null
  return value.replace(/[\s()<>"'`\\[\]]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  )
}

function safeLinkUrl(raw: string): string | null {
  return markdownSafeUrl(raw, LINK_SCHEMES)
}

/** Only absolute links are turned into links automatically when pasted over selected text. */
function isPastableLink(raw: string): boolean {
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(raw.trim()) && safeLinkUrl(raw) !== null
}

function imageAltText(raw: string): string {
  return raw.replace(/[[\]\\]/g, "").replace(/[\r\n]+/g, " ")
}

function imageTitle(raw: string): string {
  return raw.replace(/["\r\n]+/g, " ").trim()
}

/* ---------- Image node ---------- */

export type PostBodyImage = { src: string; altText: string; title?: string }

type SerializedImageNode = Spread<{ src: string; altText: string; title: string }, SerializedLexicalNode>

const IMAGE_NODE_TYPE = "post-body-image"

/** Inline Markdown image. Sources are restricted to http(s) or relative URLs. */
export class ImageNode extends DecoratorNode<React.JSX.Element | null> {
  declare __src: string
  declare __altText: string
  declare __title: string

  static getType(): string {
    return IMAGE_NODE_TYPE
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__title, node.__key)
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: typeof serialized.src === "string" ? serialized.src : "",
      altText: typeof serialized.altText === "string" ? serialized.altText : "",
      title: typeof serialized.title === "string" ? serialized.title : "",
    })
  }

  constructor(src: string, altText: string, title: string, key?: NodeKey) {
    super(key)
    this.__src = markdownSafeUrl(src) ?? ""
    this.__altText = imageAltText(altText)
    this.__title = imageTitle(title)
  }

  exportJSON(): SerializedImageNode {
    return {
      type: IMAGE_NODE_TYPE,
      version: 1,
      src: this.__src,
      altText: this.__altText,
      title: this.__title,
    }
  }

  exportDOM(): DOMExportOutput {
    const image = document.createElement("img")
    if (this.__src !== "") image.setAttribute("src", this.__src)
    image.setAttribute("alt", this.__altText)
    if (this.__title !== "") image.setAttribute("title", this.__title)
    return { element: image }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span")
    const className = config.theme.image
    if (typeof className === "string" && className !== "") span.className = className
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): true {
    return true
  }

  getSrc(): string {
    return this.getLatest().__src
  }

  getTextContent(): string {
    return this.toMarkdown()
  }

  toMarkdown(): string {
    const latest = this.getLatest()
    if (latest.__src === "") return ""
    const title = latest.__title === "" ? "" : ` "${latest.__title}"`
    return `![${latest.__altText}](${latest.__src}${title})`
  }

  decorate(): React.JSX.Element | null {
    if (this.__src === "") return null
    return (
      <img
        src={this.__src}
        alt={this.__altText}
        title={this.__title || undefined}
        draggable={false}
        className="my-1 block h-auto max-h-[28rem] max-w-full rounded-md border bg-muted object-contain"
      />
    )
  }
}

export function $createImageNode({ src, altText, title = "" }: PostBodyImage): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, altText, title))
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode
}

/* ---------- Markdown conversion ---------- */

const IMAGE_PATTERN = String.raw`!\[([^[\]\\]*)\]\(([^()\s]+)(?:\s+"([^"]*)")?\)`

const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => ($isImageNode(node) ? node.toMarkdown() : null),
  importRegExp: new RegExp(IMAGE_PATTERN),
  regExp: new RegExp(`${IMAGE_PATTERN}$`),
  replace: (textNode, match) => {
    const src = match[2] ?? ""
    // Unsafe or non-canonical sources stay as literal text, so nothing is lost or activated.
    if (markdownSafeUrl(src) !== src) return
    textNode.replace(
      $createImageNode({ src, altText: match[1] ?? "", title: match[3] ?? "" })
    )
  },
  trigger: ")",
  type: "text-match",
}

const SAFE_LINK: TextMatchTransformer = {
  ...LINK,
  replace: (textNode, match) => {
    const url = match[2] ?? ""
    // Links with unsafe schemes stay as literal text instead of becoming active links.
    if (safeLinkUrl(url) !== url) return
    return LINK.replace?.(textNode, match)
  },
}

/** The Markdown subset the visual editor reads and writes; anything else stays literal text. */
const BODY_TRANSFORMERS: Transformer[] = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  CODE,
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  IMAGE,
  SAFE_LINK,
]

const IMPORT_TAG = "post-body-import"

/** Bold, italic and inline code: the text formats that have a Markdown representation. */
const ALLOWED_TEXT_FORMAT = 1 | 2 | 16

function exportMarkdown(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $convertToMarkdownString(BODY_TRANSFORMERS))
}

/** Normalizes equivalent Markdown spellings so only meaningful round-trip changes are flagged. */
function canonicalMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]+$/, "")
        .replace(/^(\s*)[*+](\s)/, (_match, indent: string, space: string) => `${indent}-${space}`)
        .replace(/^(\s*)\d+[.)](\s)/, (_match, indent: string, space: string) => `${indent}1.${space}`)
    )
    .join("\n")
    .replace(/__/g, "**")
    .replace(/_/g, "*")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/* ---------- Selection helpers ---------- */

function $restoreSnapshot(snapshot: RangeSelection | null): RangeSelection | null {
  if (snapshot === null) return null
  const valid = [snapshot.anchor, snapshot.focus].every((point) => {
    const node = $getNodeByKey(point.key)
    if (node === null || !node.isAttached()) return false
    if (point.type === "text") return $isTextNode(node) && point.offset <= node.getTextContentSize()
    return $isElementNode(node) && point.offset <= node.getChildrenSize()
  })
  if (!valid) return null
  const restored = snapshot.clone()
  $setSelection(restored)
  return restored
}

/** Current selection, else the retained one, else (optionally) the end of the document. */
function $resolveSelection(
  snapshot: RangeSelection | null,
  fallbackToEnd: boolean
): RangeSelection | null {
  const current = $getSelection()
  if ($isRangeSelection(current)) return current
  const restored = $restoreSnapshot(snapshot)
  if (restored !== null || !fallbackToEnd) return restored
  $getRoot().selectEnd()
  const end = $getSelection()
  return $isRangeSelection(end) ? end : null
}

function $isBlankBlock(node: LexicalNode | null): node is ElementNode {
  return $isElementNode(node) && !node.isInline() && node.getTextContent().trim() === ""
}

/* ---------- Node sanitizers (paste, clipboard JSON, and programmatic content) ---------- */

function $sanitizeLink(node: LinkNode): void {
  const url = node.getURL()
  const safe = safeLinkUrl(url)
  if (safe === null) {
    for (const child of node.getChildren()) node.insertBefore(child)
    node.remove()
    return
  }
  if (safe !== url) node.setURL(safe)
  const title = node.getTitle()
  if (title && /["\r\n]/.test(title)) node.setTitle(imageTitle(title) || null)
}

function $removeEmptyImage(node: ImageNode): void {
  if (node.getSrc() === "") node.remove()
}

function $stripUnsupportedFormat(node: TextNode): void {
  const format = node.getFormat()
  if ((format & ~ALLOWED_TEXT_FORMAT) !== 0) node.setFormat(format & ALLOWED_TEXT_FORMAT)
  if (node.getStyle() !== "") node.setStyle("")
}

/* ---------- Theme ---------- */

const EDITOR_THEME: EditorThemeClasses = {
  paragraph: "mb-3 last:mb-0",
  heading: {
    h1: "mb-3 mt-6 font-serif text-3xl font-semibold leading-tight first:mt-0",
    h2: "mb-2 mt-6 font-serif text-2xl font-semibold leading-tight first:mt-0",
    h3: "mb-2 mt-5 font-serif text-xl font-semibold leading-snug first:mt-0",
    h4: "mb-2 mt-4 text-lg font-semibold leading-snug first:mt-0",
    h5: "mb-2 mt-4 text-base font-semibold first:mt-0",
    h6: "mb-2 mt-4 text-sm font-semibold uppercase tracking-wide first:mt-0",
  },
  quote:
    "mb-3 border-l-4 border-primary/40 bg-muted/30 py-1 pl-4 pr-2 italic text-muted-foreground last:mb-0",
  list: {
    ul: "mb-3 list-disc space-y-1 pl-6 last:mb-0",
    ol: "mb-3 list-decimal space-y-1 pl-6 last:mb-0",
    listitem: "pl-1 marker:text-muted-foreground",
    nested: { listitem: "list-none [&>ol]:mb-0 [&>ol]:mt-1 [&>ul]:mb-0 [&>ul]:mt-1" },
  },
  link: "text-primary underline decoration-primary/40 underline-offset-2",
  code: "mb-3 block overflow-x-auto whitespace-pre rounded-md border bg-muted/60 px-4 py-3 font-mono text-[0.8125rem] leading-6 last:mb-0",
  text: {
    bold: "font-bold",
    italic: "italic",
    code: "rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]",
  },
  image: "inline-block max-w-full align-bottom",
}

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeNode,
  CodeHighlightNode,
  ImageNode,
]

/* ---------- Public component ---------- */

export type PostBodyEditorHandle = {
  /** Latest body Markdown; the loaded source is returned unchanged until the content is edited. */
  getMarkdown: () => string
  /**
   * Inserts an image as its own block at the retained editor selection, or appends it when the
   * editor has no valid selection, then focuses the editor. Returns false if nothing was inserted.
   */
  insertImage: (image: PostBodyImage) => boolean
  focus: () => void
}

export type PostBodyEditorProps = {
  id: string
  /** Markdown loaded when the editor mounts; remount (change `key`) to load other content. */
  markdown: string
  onChange: (markdown: string) => void
  disabled: boolean
  invalid: boolean
  labelledBy: string
  describedBy?: string
  handleRef: React.Ref<PostBodyEditorHandle>
}

export function PostBodyEditor(props: PostBodyEditorProps): React.JSX.Element {
  const [initialConfig] = useState(() => ({
    namespace: "PostBody",
    theme: EDITOR_THEME,
    nodes: EDITOR_NODES,
    editable: !props.disabled,
    onError: (error: Error) => {
      console.error("Post body editor error:", error.message)
    },
  }))

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <PostBodyEditorSurface {...props} />
    </LexicalComposer>
  )
}

function PostBodyEditorSurface({
  id,
  markdown,
  onChange,
  disabled,
  invalid,
  labelledBy,
  describedBy,
  handleRef,
}: PostBodyEditorProps): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const selectionRef = useRef<RangeSelection | null>(null)
  const [unsupported, setUnsupported] = useState(false)

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [editor, disabled])

  const noticeId = `${id}-compatibility`
  const ariaDescribedBy =
    [describedBy, unsupported ? noticeId : null].filter(Boolean).join(" ") || undefined

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
        "has-[[contenteditable=true]:focus-visible]:border-ring has-[[contenteditable=true]:focus-visible]:ring-[3px] has-[[contenteditable=true]:focus-visible]:ring-ring/50",
        invalid && "border-destructive ring-destructive/20",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <BodyToolbar editorId={id} disabled={disabled} selectionRef={selectionRef} />
      {unsupported ? (
        <p
          id={noticeId}
          className="flex items-start gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Some formatting in this post can&apos;t be shown exactly in the visual editor. The
            saved body stays unchanged until you edit it, so review the formatting before saving
            edits.
          </span>
        </p>
      ) : null}
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              id={id}
              ariaLabelledBy={labelledBy}
              ariaDescribedBy={ariaDescribedBy}
              ariaInvalid={invalid ? true : undefined}
              ariaMultiline
              aria-placeholder="Start writing your post…"
              placeholder={
                <div className="pointer-events-none absolute left-4 top-3 select-none text-[0.9375rem] leading-7 text-muted-foreground">
                  Start writing your post…
                </div>
              }
              className="max-h-[min(70vh,48rem)] min-h-80 overflow-y-auto rounded-b-md px-4 py-3 text-[0.9375rem] leading-7 text-foreground outline-none focus-visible:outline-none"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin validateUrl={isPastableLink} />
      <MarkdownShortcutPlugin transformers={BODY_TRANSFORMERS} />
      <BodySyncPlugin
        markdown={markdown}
        onChange={onChange}
        selectionRef={selectionRef}
        handleRef={handleRef}
        onUnsupportedChange={setUnsupported}
      />
    </div>
  )
}

/* ---------- Content synchronization ---------- */

function BodySyncPlugin({
  markdown,
  onChange,
  selectionRef,
  handleRef,
  onUnsupportedChange,
}: {
  markdown: string
  onChange: (markdown: string) => void
  selectionRef: React.RefObject<RangeSelection | null>
  handleRef: React.Ref<PostBodyEditorHandle>
  onUnsupportedChange: (unsupported: boolean) => void
}): null {
  const [editor] = useLexicalComposerContext()
  const initialMarkdownRef = useRef(markdown)
  const latestRef = useRef(markdown)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const source = initialMarkdownRef.current
    // Registered before the content exists so sanitizing never produces a load-time edit.
    const unregisterTransforms = mergeRegister(
      editor.registerNodeTransform(LinkNode, $sanitizeLink),
      editor.registerNodeTransform(ImageNode, $removeEmptyImage),
      editor.registerNodeTransform(TextNode, $stripUnsupportedFormat)
    )

    editor.update(
      () => {
        $convertFromMarkdownString(source.replace(/\r\n?/g, "\n"), BODY_TRANSFORMERS)
        $setSelection(null)
      },
      { discrete: true, tag: IMPORT_TAG }
    )
    const baseline = exportMarkdown(editor)
    latestRef.current = source
    selectionRef.current = null
    onUnsupportedChange(canonicalMarkdown(baseline) !== canonicalMarkdown(source))
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)

    const unregisterListener = editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        const selection = editorState.read(() => {
          const current = $getSelection()
          return $isRangeSelection(current) ? current.clone() : null
        })
        if (selection !== null) selectionRef.current = selection
        if (tags.has(IMPORT_TAG)) return
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
        const exported = editorState.read(() => $convertToMarkdownString(BODY_TRANSFORMERS))
        // Content equivalent to what was loaded keeps the stored Markdown byte-for-byte.
        const next = exported === baseline ? source : exported
        if (next === latestRef.current) return
        latestRef.current = next
        onChangeRef.current(next)
      }
    )

    return () => {
      unregisterListener()
      unregisterTransforms()
    }
  }, [editor, onUnsupportedChange, selectionRef])

  useImperativeHandle(
    handleRef,
    () => ({
      getMarkdown: () => latestRef.current,
      focus: () => editor.focus(),
      insertImage: (image) => {
        const inserted: { key: NodeKey | null } = { key: null }
        editor.update(
          () => {
            const imageNode = $createImageNode(image)
            if (imageNode.getSrc() === "") return
            const block = $createParagraphNode().append(imageNode)
            // Effects run outside DOM events, so use the selection retained from the editor.
            const selection = $restoreSnapshot(selectionRef.current)
            if (selection !== null) {
              if (!selection.isCollapsed()) selection.removeText()
              $insertNodeToNearestRoot(block)
            } else {
              const root = $getRoot()
              const last = root.getLastChild()
              if ($isParagraphNode(last) && last.getChildren().every($isTextNode) && $isBlankBlock(last)) {
                last.replace(block)
              } else {
                root.append(block)
              }
            }
            const previous = block.getPreviousSibling()
            if ($isBlankBlock(previous)) previous.remove()
            let next = block.getNextSibling()
            if ($isBlankBlock(next) && !$isParagraphNode(next)) {
              const paragraph = $createParagraphNode()
              next.replace(paragraph)
              next = paragraph
            }
            if (!$isElementNode(next)) {
              const paragraph = $createParagraphNode()
              block.insertAfter(paragraph)
              next = paragraph
            }
            next.selectStart()
            inserted.key = imageNode.getKey()
          },
          { discrete: true }
        )
        if (inserted.key === null) return false
        editor.getRootElement()?.focus({ preventScroll: true })
        editor.getElementByKey(inserted.key)?.scrollIntoView({ block: "nearest" })
        return true
      },
    }),
    [editor, selectionRef]
  )

  return null
}

/* ---------- Toolbar ---------- */

type BlockType = "paragraph" | HeadingTagType | "quote" | "code" | ListType

type ToolbarState = {
  block: BlockType
  bold: boolean
  italic: boolean
  code: boolean
  link: string | null
}

const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  block: "paragraph",
  bold: false,
  italic: false,
  code: false,
  link: null,
}

const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: "Paragraph",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  quote: "Quote",
  code: "Code block",
  bullet: "Bulleted list",
  number: "Numbered list",
  check: "Checklist",
}

const STYLE_OPTIONS: BlockType[] = ["paragraph", "h2", "h3", "h4"]

function $readToolbarState(): ToolbarState {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return DEFAULT_TOOLBAR_STATE
  const anchor = selection.anchor.getNode()
  const top = $isRootOrShadowRoot(anchor)
    ? null
    : $findMatchingParent(anchor, (node) => {
        const parent = node.getParent()
        return parent !== null && $isRootOrShadowRoot(parent)
      })

  let block: BlockType = "paragraph"
  if ($isListNode(top)) {
    block = ($getNearestNodeOfType(anchor, ListNode) ?? top).getListType()
  } else if ($isHeadingNode(top)) {
    block = top.getTag()
  } else if ($isQuoteNode(top)) {
    block = "quote"
  } else if ($isCodeNode(top)) {
    block = "code"
  }

  const link =
    $findMatchingParent(anchor, $isLinkNode) ??
    $findMatchingParent(selection.focus.getNode(), $isLinkNode)

  return {
    block,
    bold: selection.hasFormat("bold"),
    italic: selection.hasFormat("italic"),
    code: selection.hasFormat("code"),
    link: link === null ? null : link.getURL(),
  }
}

function sameToolbarState(a: ToolbarState, b: ToolbarState): boolean {
  return (
    a.block === b.block &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.link === b.link
  )
}

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keep focus (and the caret) in the editor when clicking with a pointer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        pressed && "bg-secondary text-foreground shadow-xs ring-1 ring-primary/30"
      )}
    >
      {children}
    </button>
  )
}

function ToolbarDivider(): React.JSX.Element {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
}

function BodyToolbar({
  editorId,
  disabled,
  selectionRef,
}: {
  editorId: string
  disabled: boolean
  selectionRef: React.RefObject<RangeSelection | null>
}): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [state, setState] = useState<ToolbarState>(DEFAULT_TOOLBAR_STATE)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => {
          const next = editorState.read($readToolbarState)
          setState((current) => (sameToolbarState(current, next) ? current : next))
        }),
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (payload) => {
            setCanUndo(payload)
            return false
          },
          COMMAND_PRIORITY_CRITICAL
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (payload) => {
            setCanRedo(payload)
            return false
          },
          COMMAND_PRIORITY_CRITICAL
        )
      ),
    [editor]
  )

  useEffect(() => {
    if (disabled) setLinkOpen(false)
  }, [disabled])

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus()
  }, [linkOpen])

  const withSelection = (action: (selection: RangeSelection) => void) => {
    if (disabled) return
    editor.update(() => {
      const selection = $resolveSelection(selectionRef.current, true)
      if (selection !== null) action(selection)
    })
  }

  const setBlock = (next: BlockType) =>
    withSelection((selection) => {
      if (next === "paragraph") $setBlocksType(selection, () => $createParagraphNode())
      else if (next === "h1" || next === "h2" || next === "h3" || next === "h4" || next === "h5" || next === "h6")
        $setBlocksType(selection, () => $createHeadingNode(next))
    })

  const toggleWrapper = (kind: "quote" | "code") =>
    withSelection((selection) => {
      if (state.block === kind) $setBlocksType(selection, () => $createParagraphNode())
      else if (kind === "quote") $setBlocksType(selection, () => $createQuoteNode())
      else $setBlocksType(selection, () => $createCodeNode())
    })

  const toggleList = (type: "bullet" | "number") =>
    withSelection(() => {
      if (state.block === type) $removeList()
      else $insertList(type)
    })

  const toggleFormat = (format: "bold" | "italic" | "code") =>
    withSelection((selection) => selection.formatText(format))

  const openLink = () => {
    if (disabled) return
    setLinkDraft(state.link ?? "")
    setLinkError(null)
    setLinkOpen(true)
  }

  const closeLink = () => {
    setLinkOpen(false)
    setLinkError(null)
    editor.focus()
  }

  const applyLink = () => {
    const draft = linkDraft.trim()
    const safe = safeLinkUrl(draft)
    if (safe === null) {
      setLinkError("Enter a web address (https://…), mailto: or tel: link, or a path on this site.")
      linkInputRef.current?.focus()
      return
    }
    withSelection((selection) => {
      if (!selection.isCollapsed()) {
        $toggleLink(safe)
        return
      }
      const existing = $findMatchingParent(selection.anchor.getNode(), $isLinkNode)
      if (existing !== null) {
        existing.setURL(safe)
        return
      }
      const link = $createLinkNode(safe)
      link.append($createTextNode(draft))
      selection.insertNodes([link])
    })
    closeLink()
  }

  const removeLink = () => {
    withSelection(() => $toggleLink(null))
    closeLink()
  }

  const onToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    if (event.target instanceof HTMLSelectElement) return
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)")
    )
    const index = items.indexOf(event.target as HTMLElement)
    if (index === -1 || items.length === 0) return
    event.preventDefault()
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length
    items[nextIndex]?.focus()
  }

  const styleOptions: BlockType[] = STYLE_OPTIONS.includes(state.block)
    ? STYLE_OPTIONS
    : [...STYLE_OPTIONS, state.block]
  const styleIsSettable = state.block === "paragraph" || state.block.startsWith("h")
  const linkInputId = `${editorId}-link-url`
  const linkErrorId = `${editorId}-link-error`

  return (
    <>
      <div
        role="toolbar"
        aria-label="Body formatting"
        aria-controls={editorId}
        onKeyDown={onToolbarKeyDown}
        className="flex flex-wrap items-center gap-1 rounded-t-md border-b bg-muted/40 px-2 py-1.5"
      >
        <label htmlFor={`${editorId}-block-style`} className="sr-only">
          Text style
        </label>
        <select
          id={`${editorId}-block-style`}
          value={state.block}
          disabled={disabled}
          onChange={(event) => setBlock(event.target.value as BlockType)}
          className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {styleOptions.map((option) => (
            <option
              key={option}
              value={option}
              disabled={!STYLE_OPTIONS.includes(option) && !(styleIsSettable && option === state.block)}
            >
              {BLOCK_LABELS[option]}
            </option>
          ))}
        </select>

        <ToolbarDivider />
        <ToolbarButton label="Bold" pressed={state.bold} disabled={disabled} onClick={() => toggleFormat("bold")}>
          <Bold aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          pressed={state.italic}
          disabled={disabled}
          onClick={() => toggleFormat("italic")}
        >
          <Italic aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          pressed={state.code}
          disabled={disabled}
          onClick={() => toggleFormat("code")}
        >
          <Code aria-hidden="true" />
        </ToolbarButton>

        <ToolbarDivider />
        <ToolbarButton
          label="Bulleted list"
          pressed={state.block === "bullet"}
          disabled={disabled}
          onClick={() => toggleList("bullet")}
        >
          <List aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          pressed={state.block === "number"}
          disabled={disabled}
          onClick={() => toggleList("number")}
        >
          <ListOrdered aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          pressed={state.block === "quote"}
          disabled={disabled}
          onClick={() => toggleWrapper("quote")}
        >
          <Quote aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          pressed={state.block === "code"}
          disabled={disabled}
          onClick={() => toggleWrapper("code")}
        >
          <SquareCode aria-hidden="true" />
        </ToolbarButton>

        <ToolbarDivider />
        <ToolbarButton
          label={state.link === null ? "Add link" : "Edit link"}
          pressed={state.link !== null}
          disabled={disabled}
          onClick={openLink}
        >
          <Link aria-hidden="true" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton
            label="Undo"
            disabled={disabled || !canUndo}
            onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          >
            <Undo2 aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={disabled || !canRedo}
            onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          >
            <Redo2 aria-hidden="true" />
          </ToolbarButton>
        </div>
      </div>

      {linkOpen ? (
        <div
          role="group"
          aria-label={state.link === null ? "Add link" : "Edit link"}
          className="flex flex-wrap items-start gap-2 border-b bg-muted/20 px-3 py-2"
        >
          <div className="min-w-0 flex-1 basis-56 space-y-1">
            <label htmlFor={linkInputId} className="sr-only">
              Link address
            </label>
            <Input
              ref={linkInputRef}
              id={linkInputId}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://example.com"
              className="h-8"
              value={linkDraft}
              disabled={disabled}
              aria-invalid={linkError ? true : undefined}
              aria-describedby={linkError ? linkErrorId : undefined}
              onChange={(event) => {
                setLinkDraft(event.target.value)
                setLinkError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  // Never submit the surrounding post form from the link field.
                  event.preventDefault()
                  applyLink()
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  closeLink()
                }
              }}
            />
            {linkError ? (
              <p id={linkErrorId} className="text-xs text-destructive">
                {linkError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={applyLink} disabled={disabled}>
              <Check aria-hidden="true" />
              Apply
            </Button>
            {state.link !== null ? (
              <Button size="sm" variant="outline" onClick={removeLink} disabled={disabled}>
                <Unlink aria-hidden="true" />
                Remove link
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={closeLink}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
