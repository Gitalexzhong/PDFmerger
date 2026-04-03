(() => {
  const dropZone = document.getElementById("drop-zone");
  const leftPane = document.getElementById("left-pane");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");
  const infoBtn = document.getElementById("info-btn");
  const closeInfoBtn = document.getElementById("close-info-btn");
  const infoModal = document.getElementById("info-modal");
  const shareLinkBtn = document.getElementById("share-link-btn");
  const themeToggle = document.getElementById("theme-toggle");
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
  let dropZoneDragDepth = 0;
  const THEME_KEY = "pdf-merger-theme";

  function isSupportedFile(file) {
    return file.type === "application/pdf" || file.type.startsWith("image/");
  }

  function isImageType(file) {
    return file.type.startsWith("image/");
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    themeToggle.textContent = isDark ? "Light Mode" : "Dark Mode";
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(saved);
  }

  async function convertImageFileToPngBytes(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error("Canvas unavailable for image conversion."));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(async (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error("Failed to convert image."));
              return;
            }
            resolve(await blob.arrayBuffer());
          }, "image/png");
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Unsupported image format."));
      };
      img.src = url;
    });
  }

  async function addImageFileToPdf(mergedPdf, file, rotationDeg = 0) {
    const lowerType = (file.type || "").toLowerCase();
    let image;
    if (lowerType === "image/jpeg" || lowerType === "image/jpg") {
      image = await mergedPdf.embedJpg(await file.arrayBuffer());
    } else if (lowerType === "image/png") {
      image = await mergedPdf.embedPng(await file.arrayBuffer());
    } else {
      const pngBytes = await convertImageFileToPngBytes(file);
      image = await mergedPdf.embedPng(pngBytes);
    }
    const width = image.width;
    const height = image.height;
    const normalizedRotation = ((rotationDeg % 360) + 360) % 360;
    const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
    const pageWidth = isQuarterTurn ? height : width;
    const pageHeight = isQuarterTurn ? width : height;
    const page = mergedPdf.addPage([pageWidth, pageHeight]);

    if (normalizedRotation === 0) {
      page.drawImage(image, { x: 0, y: 0, width, height });
    } else if (normalizedRotation === 90) {
      page.drawImage(image, {
        x: pageWidth,
        y: 0,
        width,
        height,
        rotate: window.PDFLib.degrees(90)
      });
    } else if (normalizedRotation === 180) {
      page.drawImage(image, {
        x: pageWidth,
        y: pageHeight,
        width,
        height,
        rotate: window.PDFLib.degrees(180)
      });
    } else if (normalizedRotation === 270) {
      page.drawImage(image, {
        x: 0,
        y: pageHeight,
        width,
        height,
        rotate: window.PDFLib.degrees(270)
      });
    }
  }

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

  function setDropZoneFeedback(fileCountValue) {
    if (fileCountValue > 0) {
      const text = fileCountValue === 1 ? "Upload 1 file" : `Upload ${fileCountValue} files`;
      dropZone.dataset.dropMessage = text;
      dropZone.classList.add("drag-over");
    } else {
      dropZone.classList.remove("drag-over");
      delete dropZone.dataset.dropMessage;
    }
  }

  function resetDropFeedback() {
    setSelectedPanelDropFeedback(0);
    setDropZoneFeedback(0);
    leftPaneDragDepth = 0;
    selectedPanelDragDepth = 0;
    dropZoneDragDepth = 0;
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
    for (const item of inputFiles) {
      const file = item.file;
      if (file.type === "application/pdf") {
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));
      } else if (file.type.startsWith("image/")) {
        await addImageFileToPdf(mergedPdf, file, item.rotation || 0);
      } else {
        throw new Error(`Unsupported file: ${file.name}`);
      }
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
    files.forEach((item, index) => {
      const file = item.file;
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
          ${
            isImageType(file)
              ? `<button class="rotate-btn" title="Rotate image">↻ ${item.rotation || 0}°</button>`
              : ""
          }
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

      const rotateBtn = li.querySelector(".rotate-btn");
      if (rotateBtn) {
        rotateBtn.addEventListener("click", () => {
          files[index].rotation = ((files[index].rotation || 0) + 90) % 360;
          refreshUI();
        });
      }

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
    const incoming = Array.from(fileListObj)
      .filter((f) => isSupportedFile(f))
      .map((f) => ({ file: f, rotation: 0 }));
    if (incoming.length === 0) {
      setStatus("Please select PDF or image files.", "error");
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

  themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark-mode");
    const next = isDark ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  async function copyShareLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied to clipboard.", "success");
    } catch (err) {
      const temp = document.createElement("textarea");
      temp.value = url;
      temp.style.position = "fixed";
      temp.style.left = "-9999px";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
      setStatus("Link copied to clipboard.", "success");
    }
  }

  infoBtn.addEventListener("click", () => {
    infoModal.classList.remove("hidden");
  });
  closeInfoBtn.addEventListener("click", () => {
    infoModal.classList.add("hidden");
  });
  infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) {
      infoModal.classList.add("hidden");
    }
  });
  shareLinkBtn.addEventListener("click", () => {
    copyShareLink();
  });

  dropZone.addEventListener("dragover", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    e.stopPropagation();
    setDropZoneFeedback(draggedCount);
    setSelectedPanelDropFeedback(0);
  });
  dropZone.addEventListener("dragenter", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    e.stopPropagation();
    dropZoneDragDepth += 1;
    setDropZoneFeedback(draggedCount);
    setSelectedPanelDropFeedback(0);
  });
  dropZone.addEventListener("dragleave", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    e.stopPropagation();
    dropZoneDragDepth = Math.max(0, dropZoneDragDepth - 1);
    if (dropZoneDragDepth === 0) {
      setDropZoneFeedback(0);
    }
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const incomingFiles = e.dataTransfer?.files;
    resetDropFeedback();
    if (incomingFiles) addFiles(incomingFiles);
  });

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
    e.stopPropagation();
    selectedPanelDragDepth += 1;
    setSelectedPanelDropFeedback(draggedCount);
    setDropZoneFeedback(0);
  });
  selectedPanel.addEventListener("dragover", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedPanelDropFeedback(draggedCount);
    setDropZoneFeedback(0);
  });
  selectedPanel.addEventListener("dragleave", (e) => {
    const draggedCount = getDraggedFileCount(e.dataTransfer);
    if (!draggedCount) return;
    e.preventDefault();
    e.stopPropagation();
    selectedPanelDragDepth = Math.max(0, selectedPanelDragDepth - 1);
    if (selectedPanelDragDepth === 0) {
      setSelectedPanelDropFeedback(0);
    }
  });
  selectedPanel.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const incomingFiles = e.dataTransfer?.files;
    resetDropFeedback();
    if (incomingFiles) addFiles(incomingFiles);
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
  initTheme();
  refreshUI();
})();

