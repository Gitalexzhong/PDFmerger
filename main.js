const { useEffect, useMemo, useRef, useState } = React;

function generateDefaultOutputName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("") +
    "-" +
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  return `merged-${stamp}.pdf`;
}

function App() {
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragSrcIndex, setDragSrcIndex] = useState(null);
  const [status, setStatus] = useState({ message: "", type: "" });
  const [isMerging, setIsMerging] = useState(false);
  const [outputName, setOutputName] = useState(generateDefaultOutputName());
  const [previewUrl, setPreviewUrl] = useState("");
  const [lastMergedBlob, setLastMergedBlob] = useState(null);
  const fileInputRef = useRef(null);

  const fileCountLabel = useMemo(() => {
    return files.length === 1 ? "1 file" : `${files.length} files`;
  }, [files.length]);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).filter(
      (file) => file.type === "application/pdf"
    );
    if (incoming.length === 0) {
      setStatus({ message: "Please select PDF files only.", type: "error" });
      return;
    }
    setFiles((prev) => prev.concat(incoming));
    setStatus({ message: "", type: "" });
  };

  const normalizeOutputName = () => {
    const name = (outputName || "").trim();
    if (!name) return "merged.pdf";
    return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
  };

  const buildMergedBlob = async (inputFiles) => {
    if (inputFiles.length === 0) return null;
    const { PDFDocument } = window.PDFLib || {};
    if (!PDFDocument) throw new Error("PDF library failed to load.");

    const mergedPdf = await PDFDocument.create();
    for (const file of inputFiles) {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }
    const bytes = await mergedPdf.save();
    return new Blob([bytes], { type: "application/pdf" });
  };

  useEffect(() => {
    let cancelled = false;
    let currentUrl = "";

    const refreshPreview = async () => {
      if (files.length === 0) {
        setPreviewUrl("");
        setLastMergedBlob(null);
        return;
      }
      setStatus({ message: "Generating merged preview...", type: "" });
      try {
        const blob = await buildMergedBlob(files);
        if (cancelled || !blob) return;
        currentUrl = URL.createObjectURL(blob);
        setPreviewUrl(currentUrl);
        setLastMergedBlob(blob);
        setStatus({ message: "Merged preview ready.", type: "success" });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPreviewUrl("");
          setLastMergedBlob(null);
          setStatus({
            message: "Failed to generate merged preview.",
            type: "error"
          });
        }
      }
    };

    refreshPreview();
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [files]);

  const onMergeDownload = async () => {
    if (files.length === 0) return;
    setIsMerging(true);
    setStatus({ message: "Preparing merged PDF download...", type: "" });
    try {
      const blob = lastMergedBlob || (await buildMergedBlob(files));
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = normalizeOutputName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus({ message: "Merged PDF downloaded.", type: "success" });
    } catch (err) {
      console.error(err);
      setStatus({
        message: "Something went wrong while downloading merged PDF.",
        type: "error"
      });
    } finally {
      setIsMerging(false);
    }
  };

  const removeAt = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onDragStartItem = (index) => setDragSrcIndex(index);
  const onDropItem = (targetIndex) => {
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragSrcIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragSrcIndex(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>PDF Merger (React)</h1>
        <p>Merge PDFs locally in your browser. No uploads, no servers.</p>
      </header>

      <main className="app-main">
        <section className="pane">
          <section
            className={`drop-zone ${dragOver ? "drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-zone-content">
              <span className="drop-icon">📄</span>
              <p className="drop-title">Drag and drop PDF files here</p>
              <p className="drop-subtitle">or</p>
              <button
                className="btn primary"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <p className="drop-hint">Drag files in list to reorder merge order.</p>
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <h2>Selected PDFs</h2>
              <span className="badge">{fileCountLabel}</span>
            </div>
            <ul className="file-list">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="file-item"
                  draggable
                  onDragStart={() => onDragStartItem(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropItem(index)}
                >
                  <div className="file-handle">⋮⋮</div>
                  <div className="file-meta">
                    <p className="file-name">{file.name}</p>
                    <p className="file-sub">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <span className="index-chip">#{index + 1}</span>
                  <button
                    className="remove-btn"
                    type="button"
                    onClick={() => removeAt(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {files.length === 0 ? (
              <p className="empty-state">
                No files yet. Add PDFs to begin creating merged preview.
              </p>
            ) : null}
          </section>
        </section>

        <section className="pane">
          <section className="panel">
            <div className="merge-row">
              <div className="field">
                <label>Output file name</label>
                <input
                  type="text"
                  value={outputName}
                  onChange={(e) => setOutputName(e.target.value)}
                  placeholder="merged-YYYYMMDD-HHMMSS.pdf"
                />
              </div>
              <button
                className="btn primary"
                type="button"
                disabled={files.length === 0 || isMerging}
                onClick={onMergeDownload}
              >
                Merge and Download
              </button>
            </div>
            <p className={`status ${status.type}`}>{status.message}</p>
          </section>

          <section className="panel preview-panel">
            <div className="section-header">
              <h2>Merged Preview</h2>
            </div>
            {previewUrl ? (
              <iframe className="preview-frame" title="Merged PDF preview" src={previewUrl} />
            ) : (
              <div className="preview-empty">
                Merged preview appears here after adding at least one PDF.
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

