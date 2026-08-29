/**
 * Renders a schema.org JSON-LD block. Replaces the hand-written
 * <script type="application/ld+json" dangerouslySetInnerHTML=…> that was
 * copy-pasted across pages. Pass one object or an array of them.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
