import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/common/PageHeader";
import { referenceLibrary, type ReferenceMaterial } from "../../infrastructure/repositories/ReferenceLibraryService";

export function ReferenceLibraryPage() {
  const [materials, setMaterials] = useState<ReferenceMaterial[]>([]);
  const [category, setCategory] = useState("Writing");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void referenceLibrary.list().then((files) => { if (active) setMaterials(files); })
      .catch(() => { if (active) setError("Unable to read the reference library. Check the workspace and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const filtered = materials.filter((m) => m.category === category);
  const categories = ["Writing", "Speaking", "Test materials", "Other"];
  return <main className="page library-page">
    <PageHeader title="Reference materials" description="Your original documents and audio, preserved in this workspace. These are separate from complete, scored practice tests." actions={<Link className="button" to="/library">Back to practice library</Link>} />
    <div className="library-test-tabs" role="tablist" aria-label="Reference category">{categories.map((name) => <button key={name} role="tab" aria-selected={category === name} type="button" onClick={() => { setCategory(name); setPage(0); }}>{name} · {materials.filter((m) => m.category === name).length}</button>)}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {loading ? <p role="status">Loading reference materials…</p> : filtered.length === 0 ? <p className="empty-state">No reference material has been installed in this category.</p> : <>
      <p>{filtered.length} source files · opens the managed copy in your Windows document or audio app.</p>
      <div className="reference-list">{filtered.slice(page * 40, (page + 1) * 40).map((material) => <article className="reference-row" key={material.id}>
        <div><strong>{material.title}</strong><small>{material.sourceLabel}</small><span>{material.status} · {(material.size / 1048576).toFixed(1)} MB</span></div>
        <button className="button" disabled={![".pdf", ".docx", ".mp3", ".m4a", ".wma"].includes(material.format)} type="button" onClick={() => { setError(null); void referenceLibrary.open(material.id).catch(() => setError("This local resource could not be opened. Check its availability and your Windows default app.")); }}>Open</button>
      </article>)}</div>
      <div className="library-test-tabs"><button className="button" disabled={page === 0} type="button" onClick={() => setPage((p) => p - 1)}>Previous</button><span>Page {page + 1} / {Math.ceil(filtered.length / 40)}</span><button className="button" disabled={(page + 1) * 40 >= filtered.length} type="button" onClick={() => setPage((p) => p + 1)}>Next</button></div>
    </>}
  </main>;
}
