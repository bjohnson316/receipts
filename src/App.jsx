import { useState, useEffect, useRef } from "react";
import {
  Camera,
  Trash2,
  Download,
  X,
  Receipt as ReceiptIcon,
  Pencil,
  Check,
  Settings as SettingsIcon,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { utf8ToBase64, base64ToUtf8, ghCheckAccess, ghGetFile, ghPutFile, ghDeleteFile } from "./github.js";

const CATEGORIES = [
  { name: "Meals", color: "#4C7A5E" },
  { name: "Fuel", color: "#A8432E" },
  { name: "Travel", color: "#3D6B8C" },
  { name: "Lodging", color: "#8C6B4F" },
  { name: "Supplies", color: "#6B5B95" },
  { name: "Equipment", color: "#B08B2E" },
  { name: "Other", color: "#5C5C5C" },
];

const LOCAL_STORAGE_KEY = "receipt-ledger:receipts";
const GH_CONFIG_KEY = "receipt-ledger:gh-config";
const RECEIPTS_PATH = "data/receipts.json";

function emptyForm() {
  return {
    vendor: "",
    amount: "",
    category: "Other",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    image: null,
  };
}

function formatMoney(n) {
  return "$" + (parseFloat(n) || 0).toFixed(2);
}

function formatDateDisplay(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function categoryColor(name) {
  const c = CATEGORIES.find((c) => c.name === name);
  return c ? c.color : "#5C6B74";
}

function imageSrc(image) {
  if (!image) return null;
  return typeof image === "string" ? image : image.url;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1000;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.62));
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function loadLocalReceipts() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load local receipts", e);
    return [];
  }
}

function loadGhConfig() {
  try {
    const raw = localStorage.getItem(GH_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export default function App() {
  const [ghConfig, setGhConfig] = useState(loadGhConfig);
  const [ghStatus, setGhStatus] = useState("idle"); // idle | connecting | connected | error
  const [ghError, setGhError] = useState(null);
  const [receiptsSha, setReceiptsSha] = useState(null);

  const [receipts, setReceipts] = useState(ghConfig ? [] : loadLocalReceipts);
  const [initialLoading, setInitialLoading] = useState(!!ghConfig);
  const [storageError, setStorageError] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [filterCategory, setFilterCategory] = useState("All");
  const [expandedImage, setExpandedImage] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const ghConnected = ghStatus === "connected";

  useEffect(() => {
    if (ghConfig) connectAndLoad(ghConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectAndLoad(cfg) {
    setGhStatus("connecting");
    setGhError(null);
    try {
      await ghCheckAccess(cfg);
      const file = await ghGetFile(cfg, RECEIPTS_PATH);
      if (file) {
        setReceipts(JSON.parse(base64ToUtf8(file.content)));
        setReceiptsSha(file.sha);
      } else {
        setReceipts([]);
        setReceiptsSha(null);
      }
      setGhStatus("connected");
    } catch (err) {
      console.error(err);
      setGhStatus("error");
      setGhError(err.message);
      setReceipts(loadLocalReceipts());
    } finally {
      setInitialLoading(false);
    }
  }

  function saveGhConfig(cfg) {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
    setGhConfig(cfg);
    setInitialLoading(true);
    connectAndLoad(cfg);
  }

  function disconnectGh() {
    localStorage.removeItem(GH_CONFIG_KEY);
    setGhConfig(null);
    setGhStatus("idle");
    setGhError(null);
    setReceiptsSha(null);
    setReceipts(loadLocalReceipts());
  }

  async function persist(next) {
    setReceipts(next);
    if (ghConnected) {
      try {
        const content = utf8ToBase64(JSON.stringify(next, null, 2));
        const result = await ghPutFile(ghConfig, RECEIPTS_PATH, content, "Update receipts", receiptsSha);
        setReceiptsSha(result.content.sha);
        setGhError(null);
      } catch (err) {
        console.error(err);
        setGhError("Could not save to GitHub: " + err.message);
      }
    } else {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        setStorageError(false);
      } catch (e) {
        setStorageError(true);
      }
    }
  }

  async function uploadReceiptImage(id, dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const path = `images/${id}-${Date.now()}.jpg`;
    const result = await ghPutFile(ghConfig, path, base64, `Add receipt image ${id}`);
    return { path, sha: result.content.sha, url: result.content.download_url };
  }

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImgLoading(true);
    try {
      const dataUrl = await compressImage(file);
      setForm((f) => ({ ...f, image: dataUrl }));
    } catch (err) {
      console.error(err);
    } finally {
      setImgLoading(false);
      e.target.value = "";
    }
  }

  function openAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(r) {
    setForm({ vendor: r.vendor, amount: r.amount, category: r.category, date: r.date, notes: r.notes || "", image: r.image });
    setEditingId(r.id);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.vendor.trim() || !form.amount) return;
    setSaving(true);
    try {
      const id = editingId || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      let imageField = form.image;
      if (ghConnected && typeof form.image === "string" && form.image.startsWith("data:")) {
        imageField = await uploadReceiptImage(id, form.image);
      }
      const record = { id, vendor: form.vendor.trim(), amount: form.amount, category: form.category, date: form.date, notes: form.notes, image: imageField };
      const next = editingId ? receipts.map((r) => (r.id === editingId ? record : r)) : [record, ...receipts];
      await persist(next);
      setShowModal(false);
    } catch (err) {
      console.error(err);
      setGhError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const receipt = receipts.find((r) => r.id === id);
    await persist(receipts.filter((r) => r.id !== id));
    setDeleteConfirmId(null);
    if (ghConnected && receipt && receipt.image && typeof receipt.image === "object" && receipt.image.path) {
      try {
        await ghDeleteFile(ghConfig, receipt.image.path, receipt.image.sha, `Remove receipt image ${id}`);
      } catch (err) {
        console.error("Could not delete image from GitHub", err);
      }
    }
  }

  const total = receipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const categoryTotals = CATEGORIES.map((c) => ({
    ...c,
    total: receipts.filter((r) => r.category === c.name).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    count: receipts.filter((r) => r.category === c.name).length,
  })).filter((c) => c.count > 0);

  const filtered = (filterCategory === "All" ? receipts : receipts.filter((r) => r.category === filterCategory))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const sortedDates = receipts.map((r) => r.date).sort();
  const periodStart = sortedDates[0];
  const periodEnd = sortedDates[sortedDates.length - 1];

  function handleExport() {
    window.print();
  }

  if (initialLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <Loader2 size={22} className="spin" />
          <span>Connecting to GitHub…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="screen-only">
        <div className="app-inner">
          <div className="header">
            <div className="eyebrow-row">
              <div className="eyebrow">
                <ReceiptIcon size={18} color="#A8432E" />
                <span>Expense Ledger</span>
              </div>
              <button className="storage-indicator" onClick={() => setShowSettings(true)}>
                {ghConnected ? <Cloud size={15} /> : <CloudOff size={15} />}
                <SettingsIcon size={13} />
              </button>
            </div>
            <h1 className="title">Receipts</h1>

            <div className="total-card">
              <div className="total-row">
                <span className="total-label">Total</span>
                <span className="total-count">
                  {receipts.length} receipt{receipts.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="total-amount">{formatMoney(total)}</div>
            </div>

            {ghConfig && ghStatus === "error" && (
              <div className="storage-warning">GitHub sync error: {ghError}. Working from local data instead.</div>
            )}
            {ghConfig && ghConnected && ghError && <div className="storage-warning">{ghError}</div>}
            {!ghConfig && storageError && (
              <div className="storage-warning">Couldn't save to this browser's storage — changes may be lost on refresh.</div>
            )}
            {!ghConfig && (
              <button className="gh-setup-nudge" onClick={() => setShowSettings(true)}>
                <Cloud size={13} /> Store receipts &amp; photos in GitHub instead of just this browser
              </button>
            )}
          </div>

          {receipts.length > 0 && (
            <div className="chips">
              <button
                className={"chip" + (filterCategory === "All" ? " chip-active" : "")}
                style={{ "--chip-color": "#1D2B36" }}
                onClick={() => setFilterCategory("All")}
              >
                All ({receipts.length})
              </button>
              {categoryTotals.map((c) => (
                <button
                  key={c.name}
                  className={"chip" + (filterCategory === c.name ? " chip-active" : "")}
                  style={{ "--chip-color": c.color }}
                  onClick={() => setFilterCategory(c.name)}
                >
                  {c.name} ({c.count})
                </button>
              ))}
            </div>
          )}

          <div className="receipt-list">
            {filtered.length === 0 && (
              <div className="empty-state">
                <ReceiptIcon size={28} style={{ opacity: 0.4 }} />
                <p>{receipts.length === 0 ? "No receipts yet. Snap your first one." : "No receipts in this category."}</p>
              </div>
            )}

            {filtered.map((r) => (
              <div key={r.id} className="receipt-card">
                <button className="receipt-thumb" onClick={() => (imageSrc(r.image) ? setExpandedImage(imageSrc(r.image)) : null)}>
                  {imageSrc(r.image) ? <img src={imageSrc(r.image)} alt={r.vendor} /> : <Camera size={20} style={{ opacity: 0.4 }} />}
                </button>

                <div className="receipt-info">
                  <div className="receipt-top">
                    <div className="receipt-vendor-block">
                      <div className="receipt-vendor">{r.vendor}</div>
                      <div className="receipt-date">{formatDateDisplay(r.date)}</div>
                    </div>
                    <div className="receipt-amount">{formatMoney(r.amount)}</div>
                  </div>
                  <div className="receipt-bottom">
                    <span className="category-tag" style={{ "--tag-color": categoryColor(r.category) }}>
                      {r.category}
                    </span>
                    <div className="receipt-actions">
                      <button className="icon-btn" onClick={() => openEdit(r)} aria-label="Edit">
                        <Pencil size={14} />
                      </button>
                      {deleteConfirmId === r.id ? (
                        <>
                          <button className="icon-btn icon-btn-danger" onClick={() => handleDelete(r.id)} aria-label="Confirm delete">
                            <Check size={14} />
                          </button>
                          <button className="icon-btn" onClick={() => setDeleteConfirmId(null)} aria-label="Cancel">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button className="icon-btn" onClick={() => setDeleteConfirmId(r.id)} aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="action-bar">
          <div className="action-bar-inner">
            <button className="action-btn" onClick={handleExport} disabled={receipts.length === 0}>
              <Download size={16} /> Export PDF
            </button>
            <button className="action-btn action-btn-primary" onClick={openAdd}>
              <Camera size={16} /> Add Receipt
            </button>
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingId ? "Edit Receipt" : "New Receipt"}</h2>
                <button className="icon-btn" onClick={() => setShowModal(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <button
                  className="capture-zone"
                  style={{ height: imageSrc(form.image) ? 180 : 120 }}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  {imgLoading ? (
                    <span className="mono-note">Processing…</span>
                  ) : imageSrc(form.image) ? (
                    <img src={imageSrc(form.image)} alt="receipt preview" />
                  ) : (
                    <span className="capture-placeholder">
                      <Camera size={22} />
                      <span>Tap to take photo</span>
                    </span>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />

                <div className="field">
                  <label>Vendor</label>
                  <input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} placeholder="e.g. Shell, Home Depot" />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="mono-input"
                    />
                  </div>
                  <div className="field">
                    <label>Date</label>
                    <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mono-input" />
                  </div>
                </div>

                <div className="field">
                  <label>Category</label>
                  <div className="category-picker">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.name}
                        className={"category-option" + (form.category === c.name ? " category-option-active" : "")}
                        style={{ "--cat-color": c.color }}
                        onClick={() => setForm((f) => ({ ...f, category: c.name }))}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Notes (optional)</label>
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
              </div>

              <div className="modal-footer">
                <button className="save-btn" onClick={handleSave} disabled={!form.vendor.trim() || !form.amount || saving}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add to Ledger"}
                </button>
              </div>
            </div>
          </div>
        )}

        {expandedImage && (
          <div className="image-viewer" onClick={() => setExpandedImage(null)}>
            <img src={expandedImage} alt="receipt" />
            <button className="image-viewer-close" onClick={() => setExpandedImage(null)}>
              <X size={26} />
            </button>
          </div>
        )}

        {showSettings && (
          <SettingsModal
            initialConfig={ghConfig}
            status={ghStatus}
            error={ghError}
            onClose={() => setShowSettings(false)}
            onSave={saveGhConfig}
            onDisconnect={disconnectGh}
          />
        )}
      </div>

      {/* ============ PRINT REPORT ============ */}
      <div className="print-only">
        <div className="print-header">
          <h1>Expense Report</h1>
          <div className="print-meta">
            Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            {periodStart && (
              <>
                {" "}
                · Period {formatDateDisplay(periodStart)} – {formatDateDisplay(periodEnd)}
              </>
            )}
          </div>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Category</th>
              <th>Notes</th>
              <th className="align-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {receipts
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((r) => (
                <tr key={r.id}>
                  <td className="mono">{formatDateDisplay(r.date)}</td>
                  <td>{r.vendor}</td>
                  <td>{r.category}</td>
                  <td className="print-notes">{r.notes}</td>
                  <td className="align-right mono">{formatMoney(r.amount)}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td className="align-right mono">{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>

        {categoryTotals.length > 1 && (
          <div className="print-category-summary">
            <h2>By Category</h2>
            {categoryTotals.map((c) => (
              <div key={c.name} className="print-category-row">
                <span>{c.name}</span>
                <span>{formatMoney(c.total)}</span>
              </div>
            ))}
          </div>
        )}

        {receipts.some((r) => imageSrc(r.image)) && (
          <div className="print-images">
            <h2>Receipt Images</h2>
            <div className="print-images-grid">
              {receipts
                .filter((r) => imageSrc(r.image))
                .map((r) => (
                  <div key={r.id} className="print-image-item">
                    <img src={imageSrc(r.image)} alt={r.vendor} />
                    <div className="print-image-caption">
                      {r.vendor} · {formatMoney(r.amount)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsModal({ initialConfig, status, error, onClose, onSave, onDisconnect }) {
  const [owner, setOwner] = useState(initialConfig?.owner || "");
  const [repo, setRepo] = useState(initialConfig?.repo || "");
  const [branch, setBranch] = useState(initialConfig?.branch || "main");
  const [token, setToken] = useState(initialConfig?.token || "");
  const [showToken, setShowToken] = useState(false);

  const canSave = owner.trim() && repo.trim() && branch.trim() && token.trim();

  function handleSubmit() {
    if (!canSave) return;
    onSave({ owner: owner.trim(), repo: repo.trim(), branch: branch.trim(), token: token.trim() });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>GitHub Storage</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="settings-intro">
            Receipts and photos will be committed to a repo you choose, so they sync across devices and survive clearing your browser.
          </p>

          <div className="field">
            <label>Repository owner</label>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="your-username" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Repository name</label>
              <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="receipt-ledger" />
            </div>
            <div className="field">
              <label>Branch</label>
              <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>
          </div>
          <div className="field">
            <label>Personal access token</label>
            <div className="token-input-wrap">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                className="mono-input"
              />
              <button type="button" className="icon-btn token-toggle" onClick={() => setShowToken((s) => !s)}>
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <p className="settings-note">
            Use a <strong>fine-grained</strong> token scoped only to this repository, with Contents set to Read and write. It's stored in this
            browser's local storage and used only to call the GitHub API directly.
          </p>

          {status === "connecting" && (
            <p className="settings-status">
              <Loader2 size={14} className="spin" /> Connecting…
            </p>
          )}
          {status === "error" && error && <p className="settings-status settings-status-error">{error}</p>}
          {status === "connected" && !error && (
            <p className="settings-status settings-status-ok">
              <Check size={14} /> Connected
            </p>
          )}
        </div>

        <div className="modal-footer settings-footer">
          {initialConfig && (
            <button className="disconnect-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          )}
          <button className="save-btn" onClick={handleSubmit} disabled={!canSave}>
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
