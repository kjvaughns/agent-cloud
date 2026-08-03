import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import DOMPurify from "isomorphic-dompurify";
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote,
  Link2, Undo2, Redo2, Code2, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The editor for everything in Resources that is prose.
 *
 * Until now every long field in the resources editor was a bare `<textarea>`
 * with `font-mono`, and the column behind three of them is called
 * `content_html`. So writing a handbook section meant typing HTML by hand, and
 * the seeded sections are full of markup nobody could have produced any other
 * way.
 *
 * THE SOURCE VIEW IS NOT A POWER-USER FEATURE.
 *
 * Those seeded sections contain tables, definition lists and classed divs that
 * a rich-text editor has no button for. tiptap does not preserve what it has no
 * schema for — it drops it, silently, on the first keystroke. Opening an
 * existing section in the WYSIWYG and saving would quietly flatten it. So the
 * source view exists to make that recoverable, and any content holding markup
 * the toolbar cannot express opens in source view by default rather than
 * ambushing whoever clicked Edit.
 */

/** Tags tiptap's StarterKit can round-trip. Anything else is content it would eat. */
const KNOWN = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "s", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "a",
]);

/** Does this HTML hold anything the toolbar cannot rebuild? */
export function needsSourceView(html: string | null | undefined): boolean {
  if (!html) return false;
  const tags = [...html.matchAll(/<\s*([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
  return tags.some((t) => !KNOWN.has(t));
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
};

export function RichText({ value, onChange, placeholder, minHeight = "220px" }: Props) {
  const [source, setSource] = useState(() => needsSourceView(value));

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExt.configure({ openOnClick: false, autolink: true }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none px-3 py-2 focus:outline-none",
          "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2",
        ),
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Switching back from source view: the editor instance still holds whatever
  // was there before the source edits, so it has to be told.
  useEffect(() => {
    if (!source && editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [source, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (source) {
    return (
      <div className="rounded-[var(--radius)] border border-border">
        <div className="flex items-center justify-between border-b border-border-soft px-2 py-1">
          <span className="px-1 text-[11px] text-muted-foreground">HTML source</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSource(false)}>
            Rich text
          </Button>
        </div>
        <Textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-none border-0 font-mono text-xs focus-visible:ring-0"
          style={{ minHeight }}
        />
      </div>
    );
  }

  const Tool = ({ on, active, label, children }: {
    on: () => void; active?: boolean; label: string; children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={Boolean(active)}
      onClick={on}
      className={cn(
        "grid h-7 w-7 place-items-center rounded transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        active ? "bg-gold-glow text-gold-bright" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-[var(--radius)] border border-border">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border-soft px-1.5 py-1">
        <Tool label="Bold" active={editor?.isActive("bold")} on={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Italic" active={editor?.isActive("italic")} on={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </Tool>
        <span className="mx-1 h-4 w-px bg-border" />
        <Tool label="Heading" active={editor?.isActive("heading", { level: 2 })}
          on={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Subheading" active={editor?.isActive("heading", { level: 3 })}
          on={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </Tool>
        <span className="mx-1 h-4 w-px bg-border" />
        <Tool label="Bulleted list" active={editor?.isActive("bulletList")}
          on={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Numbered list" active={editor?.isActive("orderedList")}
          on={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Quote" active={editor?.isActive("blockquote")}
          on={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Divider" on={() => editor?.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </Tool>
        <span className="mx-1 h-4 w-px bg-border" />
        <Tool
          label="Link"
          active={editor?.isActive("link")}
          on={() => {
            if (editor?.isActive("link")) { editor.chain().focus().unsetLink().run(); return; }
            const href = window.prompt("Link to");
            if (!href) return;
            // javascript: and data: URLs in an href are the reason this asks.
            if (!/^https?:\/\//i.test(href)) {
              window.alert("Links must start with http:// or https://");
              return;
            }
            editor?.chain().focus().setLink({ href }).run();
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
        </Tool>
        <span className="mx-1 h-4 w-px bg-border" />
        <Tool label="Undo" on={() => editor?.chain().focus().undo().run()}>
          <Undo2 className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Redo" on={() => editor?.chain().focus().redo().run()}>
          <Redo2 className="h-3.5 w-3.5" />
        </Tool>

        <button
          type="button"
          onClick={() => { onChange(editor?.getHTML() ?? value); setSource(true); }}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Code2 className="h-3 w-3" /> Source
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Read-only counterpart, so a preview cannot render something the reader would not. */
export function RichTextPreview({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  return (
    <article
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) }}
    />
  );
}
