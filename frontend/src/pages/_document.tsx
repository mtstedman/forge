import Document, {
  Head,
  Html,
  Main,
  NextScript,
  type DocumentContext,
  type DocumentInitialProps,
} from "next/document"

type ForgeDocumentProps = {
  nonce?: string
}

/** Base64 nonce as issued by a page's Content-Security-Policy header. */
const NONCE_PATTERN = /'nonce-([A-Za-z0-9+/]{16,}={0,2})'/

/**
 * Pages that need a strict CSP (the admin route) issue a per-response nonce in
 * their `Content-Security-Policy` header during getServerSideProps. The document
 * reads that same header so Next's framework scripts carry the matching nonce;
 * public pages without a nonce render exactly as before.
 */
function nonceFromResponse(ctx: DocumentContext): string | undefined {
  const header = ctx.res?.getHeader("Content-Security-Policy")
  const values = Array.isArray(header) ? header : header === undefined ? [] : [String(header)]
  for (const value of values) {
    const match = NONCE_PATTERN.exec(value)
    if (match?.[1]) return match[1]
  }
  return undefined
}

export default class ForgeDocument extends Document<ForgeDocumentProps> {
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps & ForgeDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx)
    const nonce = nonceFromResponse(ctx)
    return nonce === undefined ? initialProps : { ...initialProps, nonce }
  }

  render(): React.JSX.Element {
    const { nonce } = this.props

    return (
      <Html lang="en">
        <Head nonce={nonce} />
        <body>
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    )
  }
}
