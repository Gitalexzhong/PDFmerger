(() => {
  const dropZone = document.getElementById("drop-zone");
  const leftPane = document.getElementById("left-pane");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");
  const fileList = document.getElementById("file-list");
  const selectedPanel = document.getElementById("selected-panel");
  const fileCount = document.getElementById("file-count");
  const emptyState = document.getElementById("empty-state");
  const outputName = document.getElementById("output-name");
  const mergeBtn = document.getElementById("merge-btn");
  const status = document.getElementById("status");
  const previewFrame = document.getElementById("preview-frame");
  const previewEmpty = document.getElementById("preview-empty");

  let files = [];
  let dragSrcIndex = null;
  let dragPlaceholderEl = null;
  let dragItemEl = null;
  let pointerDrag = null;
  let mergedBlob = null;
  let previewUrl = null;
  let leftPaneDragDepth = 0;
  let selectedPanelDragDepth = 0;

  function getDraggedFileCount(dataTransfer) {
    if (!dataTransfer) return 0;
    if (dataTransfer.items && dataTransfer.items.length) {
      return Array.from(dataTransfer.items).filter((i) => i.kind === "file").length;
    }
    return dataTransfer.files ? dataTransfer.files.length : 0;
  }

  function setSelectedPanelDropFeedback(fileCountValue) {
    if (fileCountValue > 0) {
      const text = fileCountValue === 1 ? "Upload 1 file" : `Upload ${fileCountValue} files`;
      selectedPanel.dataset.dropMessage = text;
      selectedPanel.classList.add("drag-over");
    } else {
      selectedPanel.classList.remove("drag-over");
      delete selectedPanel.dataset.dropMessage;
    }
  }

  function resetDropFeedback() {
    setSelectedPanelDropFeedback(0);
    leftPaneDragDepth = 0;
    selectedPanelDragDepth = 0;
  }

  function generateDefaultOutputName() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp =
      [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("") +
      "-" +
      [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
    return `merged-${stamp}.pdf`;
  }

  function setStatus(message, type = "") {
    status.textContent = message || "";
    status.className = `status${type ? ` ${type}` : ""}`;
  }

  function normalizeOutputName() {
    const name = (outputName.value || "").trim();
    if (!name) return "merged.pdf";
    return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
  }

  async function buildMergedBlob(inputFiles) {
    const { PDFDocument } = window.PDFLib || {};
    if (!PDFDocument) throw new Error("PDF library failed to load.");
    const mergedPdf = await PDFDocument.create();
    for (const file of inputFiles) {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }
    return new Blob([await mergedPdf.save()], { type: "application/pdf" });
  }

  function animateListTransition() {
    const items = Array.from(fileList.children);
    const first = new Map(items.map((el) => [el.dataset.key, el.getBoundingClientRect()]));
    requestAnimationFrame(() => {
      const secondItems = Array.from(fileList.children);
      secondItems.forEach((el) => {
        const prev = first.get(el.dataset.key);
        if (!prev) return;
        const next = el.getBoundingClientRect();
        const deltaY = prev.top - next.top;
        if (deltaY) {
          el.style.transform = `translateY(${deltaY}px)`;
          el.style.transition = "transform 0s";
          requestAnimationFrame(() => {
            el.style.transform = "";
            el.style.transition = "transform 220ms ease";
          });
        }
      });
    });
  }

  function clearDragState() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    if (pointerDrag?.floatingEl) pointerDrag.floatingEl.remove();
    if (dragItemEl) dragItemEl.classList.remove("drag-source");
    if (dragPlaceholderEl) dragPlaceholderEl.remove();
    if (document.body.classList.contains("drag-active")) {
      document.body.classList.remove("drag-active");
    }
    pointerDrag = null;
    dragItemEl = null;
    dragPlaceholderEl = null;
    dragSrcIndex = null;
  }

  function getInsertIndexFromPlaceholder() {
    if (!dragPlaceholderEl) return null;
    const children = Array.from(fileList.children);
    return children.indexOf(dragPlaceholderEl);
  }

  function finishReorderFromPlaceholder() {
    if (dragSrcIndex === null || dragPlaceholderEl === null) return;
    const insertIndexRaw = getInsertIndexFromPlaceholder();
    if (insertIndexRaw === null || insertIndexRaw < 0) {
      clearDragState();
      refreshUI();
      return;
    }
    const [moved] = files.splice(dragSrcIndex, 1);
    const insertIndex = Math.min(insertIndexRaw, files.length);
    files.splice(insertIndex, 0, moved);
    clearDragState();
    refreshUI();
    animateListTransition();
  }

  function positionFloating(x, y) {
    if (!pointerDrag?.floatingEl) return;
    const left = x - pointerDrag.offsetX;
    const top = y - pointerDrag.offsetY;
    pointerDrag.floatingEl.style.transform = `translate(${left}px, ${top}px)`;
  }

  function movePlaceholder(clientY) {
    if (!dragPlaceholderEl || !dragItemEl) return;
    const candidates = Array.from(fileList.querySelectorAll(".file-item")).filter(
      (el) => el !== dragItemEl
    );
    if (candidates.length === 0) {
      fileList.appendChild(dragPlaceholderEl);
      return;
    }
    let placed = false;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        fileList.insertBefore(dragPlaceholderEl, el);
        placed = true;
        break;
      }
    }
    if (!placed) {
      fileList.appendChild(dragPlaceholderEl);
    }
  }

  function onPointerMove(e) {
    if (!pointerDrag) return;
    e.preventDefault();
    positionFloating(e.clientX, e.clientY);
    movePlaceholder(e.clientY);
  }

  function onPointerUp() {
    if (!pointerDrag) return;
    finishReorderFromPlaceholder();
  }

  function startPointerDrag(e, li, index) {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest("button")) return;

    const rect = li.getBoundingClientRect();
    dragSrcIndex = index;
    dragItemEl = li;
    dragItemEl.classList.add("drag-source");

    dragPlaceholderEl = document.createElement("li");
    dragPlaceholderEl.className = "file-placeholder";
    dragPlaceholderEl.style.height = `${rect.height}px`;
    fileList.insertBefore(dragPlaceholderEl, dragItemEl.nextSibling);

    const floatingEl = li.cloneNode(true);
    floatingEl.classList.add("floating-drag-item");
    floatingEl.style.width = `${rect.width}px`;
    floatingEl.style.height = `${rect.height}px`;
    document.body.appendChild(floatingEl);

    pointerDrag = {
      floatingEl,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
    document.body.classList.add("drag-active");
    positionFloating(e.clientX, e.clientY);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function renderList() {
    fileList.innerHTML = "";
    files.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "file-item";
      li.dataset.index = String(index);
      li.dataset.key = `${file.name}-${file.size}-${index}`;

      li.innerHTML = `
        <div class="file-handle">⋮⋮</div>
        <div class="file-meta">
          <p class="file-name">${file.name}</p>
          <p class="file-sub">${(file.size / 1024).toFixed(1)} KB</p>
        </div>
        <div class="file-actions">
          <button class="order-btn" data-action="up" title="Move up">↑</button>
          <button class="order-btn" data-action="down" title="Move down">↓</button>
          <button class="remove-btn" title="Remove file">✕</button>
        </div>
      `;

      li.addEventListener("pointerdown", (e) => startPointerDrag(e, li, index));

      li.querySelector(".remove-btn").addEventListener("click", () => {
        files.splice(index, 1);
        refreshUI();
      });

      li.querySelectorAll(".order-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = btn.dataset.action;
          const to = dir === "up" ? index - 1 : index + 1;
          if (to < 0 || to >= files.length) return;
          [files[index], files[to]] = [files[to], files[index]];
          refreshUI();
          animateListTransition();
        });
      });

      fileList.appendChild(li);
    });
  }

  async function regeneratePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    if (files.length === 0) {
      mergedBlob = null;
      previewFrame.removeAttribute("src");
      previewFrame.style.display = "none";
      previewEmpty.style.display = "block";
      return;
    }
    setStatus("Generating merged preview...");
    try {
      mergedBlob = await buildMergedBlob(files);
      previewUrl = URL.createObjectURL(mergedBlob);
      previewFrame.src = previewUrl;
      previewFrame.style.display = "block";
      previewEmpty.style.display = "none";
      setStatus("Merged preview ready.", "success");
    } catch (err) {
      console.error(err);
      mergedBlob = null;
      previewFrame.removeAttribute("src");
      previewFrame.style.display = "none";
      previewEmpty.style.display = "block";
      setStatus("Failed to generate merged preview.", "error");
    }
  }

  function refreshUI() {
    renderList();
    fileCount.textContent = files.length === 1 ? "1 file" : `${files.length} files`;
    emptyState.style.display = files.length ? "none" : "block";
    dropZone.classList.toggle("collapsed", files.length > 0);
    resetDropFeedback();
    mergeBtn.disabled = files.length === 0;
    if (files.length === 0) {
      outputName.value = "";
    }
    regeneratePreview();
  }

  function addFiles(fileListObj) {
    const incoming = Array.from(fileListObj).filter((f) => f.type === "application/pdf");
    if (incoming.length === 0) {
      setStatus("Please select PDF files only.", "error");
      return;
    }
    const hadNoFiles = files.length === 0;
    files = files.concat(incoming);
    if (!outputName.value.trim() || hadNoFiles) {
      outputName.value = generateDefaultOutputName();
    }
    refreshUI();
  }

  dropZone.addEventListener("click", () => fileInput.click());
  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  dropZone.addEventListener("dragleave", () => {});
  dropZone.addEventListener("drop", (e) => e.preventDefault());

  // Upload anywhere in left pane; show feedback on selected panel only.
  leftPane.addEventListener("dragenter", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    leftPaneDragDepth += 1;
    setSelectedPanelDropFeedback(draggedCount);
  });
  leftPane.addEventListener("dragover", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    setSelectedPanelDropFeedback(draggedCount);
  });
  leftPane.addEventListener("dragleave", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    leftPaneDragDepth = Math.max(0, leftPaneDragDepth - 1);
    if (leftPaneDragDepth === 0) {
      resetDropFeedback();
    }
  });
  leftPane.addEventListener("drop", (e) => {
    e.preventDefault();
    const incomingFiles = e.dataTransfer?.files;
    resetDropFeedback();
    if (incomingFiles) addFiles(incomingFiles);
  });

  selectedPanel.addEventListener("dragenter", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    selectedPanelDragDepth += 1;
    setSelectedPanelDropFeedback(draggedCount);
  });
  selectedPanel.addEventListener("dragover", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    setSelectedPanelDropFeedback(draggedCount);
  });
  selectedPanel.addEventListener("dragleave", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    selectedPanelDragDepth = Math.max(0, selectedPanelDragDepth - 1);
    if (selectedPanelDragDepth === 0) {
      setSelectedPanelDropFeedback(0);
    }
  });
  selectedPanel.addEventListener("drop", (e) => {
    e.preventDefault();
    // Left pane handler performs the upload to avoid duplicates.
  });

  window.addEventListener("drop", () => {
    resetDropFeedback();
  });

  mergeBtn.addEventListener("click", async () => {
    if (!files.length) return;
    mergeBtn.disabled = true;
    setStatus("Preparing merged PDF download...");
    try {
      const blob = mergedBlob || (await buildMergedBlob(files));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = normalizeOutputName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Merged PDF downloaded.", "success");
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong while downloading merged PDF.", "error");
    } finally {
      mergeBtn.disabled = files.length === 0;
    }
  });

  outputName.value = "";
  refreshUI();
})();

