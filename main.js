(() => {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");
  const fileListEl = document.getElementById("file-list");
  const fileCountEl = document.getElementById("file-count");
  const emptyStateEl = document.getElementById("empty-state");
  const mergeBtn = document.getElementById("merge-btn");
  const outputNameInput = document.getElementById("output-name");
  const statusEl = document.getElementById("status");

  /** @type {File[]} */
  let files = [];
  let dragSrcIndex = null;

  function updateStatus(message, type = "") {
    statusEl.textContent = message || "";
    statusEl.classList.remove("error", "success");
    if (type) statusEl.classList.add(type);
  }

  function updateFileCount() {
    const count = files.length;
    fileCountEl.textContent =
      count === 0 ? "0 files" : `${count} file${count === 1 ? "" : "s"}`;
  }

  function renderFileList() {
    fileListEl.innerHTML = "";
    files.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "file-item";
      li.draggable = true;
      li.dataset.index = String(index);

      const handle = document.createElement("div");
      handle.className = "file-handle";
      handle.innerHTML = "<span>⋮</span><span>⋮</span>";

      const meta = document.createElement("div");
      meta.className = "file-meta";
      const name = document.createElement("p");
      name.className = "file-name";
      name.textContent = file.name;
      const sub = document.createElement("p");
      sub.className = "file-sub";
      const sizeKb = (file.size / 1024).toFixed(1);
      sub.textContent = `${sizeKb} KB`;
      meta.appendChild(name);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "file-actions";

      const indexChip = document.createElement("span");
      indexChip.className = "index-chip";
      indexChip.textContent = `#${index + 1}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", `Remove ${file.name}`);
      removeBtn.innerHTML = "✕";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        files.splice(index, 1);
        updateUI();
      });

      actions.appendChild(indexChip);
      actions.appendChild(removeBtn);

      li.appendChild(handle);
      li.appendChild(meta);
      li.appendChild(actions);

      attachDragEvents(li);
      fileListEl.appendChild(li);
    });
  }

  function updateUI() {
    renderFileList();
    updateFileCount();
    emptyStateEl.style.display = files.length === 0 ? "block" : "none";
    mergeBtn.disabled = files.length === 0;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter(
      (f) => f.type === "application/pdf"
    );
    if (incoming.length === 0) {
      updateStatus("Please drop PDF files only.", "error");
      return;
    }
    files = files.concat(incoming);
    updateStatus("");
    updateUI();
  }

  function handleDrop(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    dropZone.classList.remove("drag-over");
    if (ev.dataTransfer?.files && ev.dataTransfer.files.length > 0) {
      addFiles(ev.dataTransfer.files);
      ev.dataTransfer.clearData();
    }
  }

  function handleDragOver(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "copy";
    dropZone.classList.add("drag-over");
  }

  function handleDragLeave(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.target === dropZone || !dropZone.contains(ev.relatedTarget)) {
      dropZone.classList.remove("drag-over");
    }
  }

  function attachDragEvents(item) {
    item.addEventListener("dragstart", (e) => {
      dragSrcIndex = Number(item.dataset.index);
      item.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragSrcIndex));
      }
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      const targetIndex = Number(item.dataset.index);
      if (dragSrcIndex === null || isNaN(targetIndex)) return;
      item.style.borderColor = "rgba(96,165,250,0.9)";
    });

    item.addEventListener("dragleave", () => {
      item.style.borderColor = "";
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.style.borderColor = "";
      const targetIndex = Number(item.dataset.index);
      const srcIndexRaw =
        dragSrcIndex ??
        (e.dataTransfer ? Number(e.dataTransfer.getData("text/plain")) : null);
      if (
        srcIndexRaw === null ||
        isNaN(srcIndexRaw) ||
        isNaN(targetIndex) ||
        srcIndexRaw === targetIndex
      ) {
        return;
      }
      const [moved] = files.splice(srcIndexRaw, 1);
      files.splice(targetIndex, 0, moved);
      dragSrcIndex = null;
      updateUI();
    });
  }

  async function mergePdfs() {
    if (files.length === 0) return;
    try {
      mergeBtn.disabled = true;
      browseBtn.disabled = true;
      updateStatus("Merging PDFs in your browser…");

      const { PDFDocument } = window.PDFLib || {};
      if (!PDFDocument) {
        throw new Error("PDF library failed to load.");
      }

      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(
          pdf,
          pdf.getPageIndices()
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });

      let outName = (outputNameInput.value || "").trim();
      if (!outName.toLowerCase().endsWith(".pdf")) {
        outName = outName ? `${outName}.pdf` : "merged.pdf";
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      updateStatus("Merged PDF downloaded.", "success");
    } catch (err) {
      console.error(err);
      updateStatus(
        "Something went wrong while merging. Try smaller files or fewer PDFs.",
        "error"
      );
    } finally {
      mergeBtn.disabled = files.length === 0;
      browseBtn.disabled = false;
    }
  }

  // Event wiring
  dropZone.addEventListener("dragover", handleDragOver);
  dropZone.addEventListener("dragleave", handleDragLeave);
  dropZone.addEventListener("drop", handleDrop);

  dropZone.addEventListener("click", () => {
    fileInput.click();
  });

  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const target = e.target;
    if (target && target.files) {
      addFiles(target.files);
      target.value = "";
    }
  });

  mergeBtn.addEventListener("click", () => {
    mergePdfs();
  });

  // Set sensible default output name
  outputNameInput.value = "merged.pdf";
  updateUI();
})();

