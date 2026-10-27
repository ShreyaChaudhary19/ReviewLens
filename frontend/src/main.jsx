
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MessageSquareText,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./styles.css";

const API = `${(import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/api`;

const NAV_ITEMS = [
  ["Overview", LayoutDashboard],
  ["Review intelligence", ScanSearch],
  ["Batch analysis", Database],
  ["Model laboratory", FlaskConical],
  ["Dataset explorer", BarChart3],
  ["Reports & about", FileText],
];

const DEFAULT_METRICS = {
  selected_model: "Naive Bayes",
  test_accuracy: 0.88125,
  test_precision_fake: 0.8388888889,
  test_recall_fake: 0.94375,
  test_f1_fake: 0.8882352941,
  test_examples: 320,
};

const DEFAULT_REVIEW =
  "The room was spotless, the staff were warm and helpful, and the location made it easy to explore the city.";

function formatPercent(value) {
  const number = Number(value ?? 0);
  return `${(number <= 1 ? number * 100 : number).toFixed(1)}%`;
}

function StatusLed({ online = false }) {
  return (
    <span
      className={`status-led ${online ? "online" : "offline"}`}
      aria-label={online ? "Connected" : "Disconnected"}
    />
  );
}

function Stat({ icon: Icon, label, value, sub, tone = "blue" }) {
  return (
    <div className="stat">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
      <ArrowUpRight className="stat-arrow" size={16} />
    </div>
  );
}

function Header({ eyebrow, title, desc, action }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        backgroundColor: "#111a2a",
        border: "1px solid #465777",
        borderRadius: 10,
        color: "#edf3ff",
        padding: "12px 16px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div
        style={{
          color: "#edf3ff",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      {payload.map((entry, index) => (
        <div
          key={`${entry.dataKey}-${index}`}
          style={{
            color: "#edf3ff",
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          {entry.name || "Reviews"}:{" "}
          {Number(entry.value).toLocaleString()}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [page, setPage] = useState("Overview");
  const [overview, setOverview] = useState(null);
  const [health, setHealth] = useState(null);
  const [review, setReview] = useState(DEFAULT_REVIEW);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [batch, setBatch] = useState(null);
  const [query, setQuery] = useState("");
  const [sample, setSample] = useState([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [datasetError, setDatasetError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await fetch(`${API}/overview`);

        if (!response.ok) {
          throw new Error(`Overview request failed: ${response.status}`);
        }

        const data = await response.json();

        if (!cancelled) {
          setOverview(data);
          setOverviewError("");
        }
      } catch (err) {
        console.error("ReviewLens overview error:", err);

        if (!cancelled) {
          setOverviewError("Dashboard statistics could not be refreshed.");
        }
      }
    }

    async function loadHealth() {
      try {
        const response = await fetch(`${API}/health`);

        if (!response.ok) {
          throw new Error(`Health request failed: ${response.status}`);
        }

        const data = await response.json();

        console.log("ReviewLens health response:", data);

        if (!cancelled) {
          setHealth(data);
        }
      } catch (err) {
        console.error("ReviewLens health check failed:", err);

        if (!cancelled) {
          setHealth({
            status: "error",
            model_loaded: false,
            load_error: err.message,
          });
        }
      }
    }

    async function loadDatasetSample() {
      try {
        const response = await fetch(`${API}/dataset-sample`);

        if (!response.ok) {
          throw new Error(`Dataset request failed: ${response.status}`);
        }

        const data = await response.json();

        if (!cancelled) {
          setSample(Array.isArray(data.rows) ? data.rows : []);
          setDatasetError("");
        }
      } catch (err) {
        console.error("ReviewLens dataset error:", err);

        if (!cancelled) {
          setDatasetError("Dataset preview could not be loaded.");
        }
      }
    }

    loadOverview();
    loadHealth();
    loadDatasetSample();

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = overview?.metrics || DEFAULT_METRICS;
  const modelConnected =
    health?.status === "ok" && health?.model_loaded === true;

  const filteredSample = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return sample;

    return sample.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(normalizedQuery)
    );
  }, [sample, query]);

  const predict = async () => {
    setError("");
    setResult(null);

    if (review.trim().length < 3) {
      setError("Enter at least 3 characters to analyse a review.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: review.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Prediction failed.");
      }

      setResult(data);
    } catch (err) {
      setError(
        `${err.message} Check that the backend is running and the model is loaded.`
      );
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async () => {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }

    setError("");
    setBatch(null);
    setBusy(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API}/batch`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Batch analysis failed.");
      }

      setBatch(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadBatch = () => {
    if (!batch || !Array.isArray(batch.rows) || batch.rows.length === 0) {
      setError("There are no batch results to export.");
      return;
    }

    const keys = [...new Set(batch.rows.flatMap((row) => Object.keys(row)))];

    const escapeCSV = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const csv = [
      keys.map(escapeCSV).join(","),
      ...batch.rows.map((row) =>
        keys.map((key) => escapeCSV(row[key])).join(",")
      ),
    ].join("\r\n");

    const blobURL = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
    );

    const anchor = document.createElement("a");
    anchor.href = blobURL;
    anchor.download = "reviewlens_predictions.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(blobURL);
  };

  const StatGrid = ({ children }) => (
    <div className="stats-grid">{children}</div>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <ScanSearch size={22} />
          </div>

          <div>
            <b>ReviewLens</b>
            <span>REVIEW INTELLIGENCE</span>
          </div>

          <button
            className="mobile-close icon-btn"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav>
          {NAV_ITEMS.map(([name, Icon], index) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => {
                setPage(name);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{name}</span>
              {index === 1 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="side-spacer" />

        <div className="model-status">
          <div className="status-top">
            <StatusLed online={modelConnected} />
            <span>
              {health === null
                ? "Checking model..."
                : modelConnected
                  ? "Model connected"
                  : "Model not connected"}
            </span>
          </div>

          <p>
            {health === null
              ? "Checking the local prediction service."
              : modelConnected
                ? "Prediction service is ready."
                : health.load_error ||
                  "Check that the backend is running and the model artifact is available."}
          </p>

          <button onClick={() => setPage("Model laboratory")}>
            Model status <ChevronRight size={14} />
          </button>
        </div>

        <div className="profile">
          <div className="avatar">AI</div>
          <div>
            <b>Research workspace</b>
            <span>Academic prototype</span>
          </div>
          <CircleHelp size={17} className="profile-help" />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <div className="crumb">
            Workspace <ChevronRight size={14} /> <b>{page}</b>
          </div>

          <div className="top-actions">
            <span className="environment">
              <i /> LOCAL ENVIRONMENT
            </span>
            <button
              className="icon-btn"
              title="Help"
              onClick={() => setPage("Reports & about")}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        <div className="content">
          {page === "Overview" && (
            <>
              <div className="hero">
                <div className="hero-grid" />

                <div className="hero-content">
                  <div className="hero-kicker">
                    <Sparkles size={14} />
                    NLP · MACHINE LEARNING · TEXT ANALYTICS
                  </div>

                  <h1>
                    Trust the signal.
                    <br />
                    <em>Question the review.</em>
                  </h1>

                  <p>
                    Explore review authenticity with a machine-learning model
                    trained on labelled review text. Turn raw language into
                    useful research signals.
                  </p>

                  <div className="hero-actions">
                    <button
                      className="primary-btn"
                      onClick={() => setPage("Review intelligence")}
                    >
                      Analyse a review <ChevronRight size={16} />
                    </button>

                    <button
                      className="ghost-btn"
                      onClick={() => setPage("Model laboratory")}
                    >
                      Explore model metrics
                    </button>
                  </div>
                </div>

                <div className="hero-orbit">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit-core">
                    <ScanSearch size={38} />
                  </div>
                  <div className="orbit-tag tag-a">
                    <ShieldCheck size={14} /> AUTHENTICITY
                  </div>
                  <div className="orbit-tag tag-b">
                    <Activity size={14} /> TEXT SIGNALS
                  </div>
                  <div className="orbit-tag tag-c">ML / NLP</div>
                </div>

                <div className="hero-foot">
                  <span>
                    <i className="green-dot" /> Research system
                  </span>
                  <span>
                    MODEL · {metrics.selected_model || "NAIVE BAYES"}
                  </span>
                  <span>VERSION 1.0.0</span>
                </div>
              </div>

              <div className="section-row">
                <div>
                  <h2>System overview</h2>
                  <p>Dataset and evaluation at a glance</p>
                </div>
                <span className="muted-pill">
                  <Activity size={13} /> Evaluation snapshot
                </span>
              </div>

              {overviewError && (
                <div className="error-box">{overviewError}</div>
              )}

              <div className="stats-grid">
                <Stat
                  icon={Database}
                  label="Labelled reviews"
                  value={(overview?.total ?? 1596).toLocaleString()}
                  sub="Dataset records"
                />
                <Stat
                  icon={ShieldCheck}
                  label="Genuine reviews"
                  value={(overview?.genuine ?? 796).toLocaleString()}
                  sub="49.87% of dataset"
                  tone="green"
                />
                <Stat
                  icon={ShieldAlert}
                  label="Fake reviews"
                  value={(overview?.fake ?? 800).toLocaleString()}
                  sub="50.13% of dataset"
                  tone="rose"
                />
                <Stat
                  icon={Gauge}
                  label="Test accuracy"
                  value={formatPercent(metrics.test_accuracy ?? 0.88125)}
                  sub={`${metrics.test_examples ?? 320} held-out examples`}
                  tone="violet"
                />
              </div>

              <div className="overview-grid">
                <section className="panel chart-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Class distribution</h3>
                      <p>Label balance across the dataset</p>
                    </div>
                    <span className="panel-icon">
                      <BarChart3 size={17} />
                    </span>
                  </div>

                  <div className="chart-legend">
                    <span>
                      <i className="legend-green" /> Genuine
                    </span>
                    <span>
                      <i className="legend-rose" /> Fake
                    </span>
                  </div>

                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          {
                            name: "Genuine",
                            count: overview?.genuine ?? 796,
                          },
                          { name: "Fake", count: overview?.fake ?? 800 },
                        ]}
                        margin={{ top: 10, right: 10, left: -14, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#243047"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#93a1b8", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: "#93a1b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />

                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ fill: "rgba(139, 155, 255, 0.06)" }}
                        />

                        <Bar
                          dataKey="count"
                          name="Reviews"
                          radius={[6, 6, 0, 0]}
                          barSize={54}
                        >
                          <Cell fill="#55c6a1" />
                          <Cell fill="#e27686" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="panel-foot">
                    <span>Dataset source</span>
                    <b>reviews.csv</b>
                  </div>
                </section>

                <section className="panel chart-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Evaluation snapshot</h3>
                      <p>Fake-class performance on held-out data</p>
                    </div>
                    <span className="panel-icon">
                      <Gauge size={17} />
                    </span>
                  </div>

                  <div className="metric-bars">
                    {[
                      [
                        "Precision",
                        metrics.test_precision_fake ?? 0.8388888889,
                        "#8b9bff",
                      ],
                      [
                        "Recall",
                        metrics.test_recall_fake ?? 0.94375,
                        "#55c6a1",
                      ],
                      [
                        "F1 score",
                        metrics.test_f1_fake ?? 0.8882352941,
                        "#e5ad68",
                      ],
                    ].map(([label, value, color]) => {
                      const percentage =
                        Number(value) <= 1
                          ? Number(value) * 100
                          : Number(value);

                      return (
                        <div className="metric-row" key={label}>
                          <div>
                            <span>{label}</span>
                            <b>{formatPercent(value)}</b>
                          </div>
                          <div className="track">
                            <span
                              style={{
                                width: `${Math.min(100, percentage)}%`,
                                background: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="note-box">
                    <Activity size={16} />
                    <span>
                      Metrics describe this saved test evaluation, not a
                      guarantee for new reviews.
                    </span>
                  </div>

                  <button
                    className="text-link"
                    onClick={() => setPage("Model laboratory")}
                  >
                    View full evaluation <ChevronRight size={15} />
                  </button>
                </section>

                <section className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Quick actions</h3>
                      <p>Continue your analysis</p>
                    </div>
                    <span className="panel-icon">
                      <Sparkles size={17} />
                    </span>
                  </div>

                  <button
                    className="action-row"
                    onClick={() => setPage("Review intelligence")}
                  >
                    <span className="action-symbol blue">
                      <MessageSquareText size={18} />
                    </span>
                    <span>
                      <b>Analyse a review</b>
                      <small>Classify a single text sample</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>

                  <button
                    className="action-row"
                    onClick={() => setPage("Batch analysis")}
                  >
                    <span className="action-symbol green">
                      <Upload size={18} />
                    </span>
                    <span>
                      <b>Run batch analysis</b>
                      <small>Upload a CSV of reviews</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>

                  <button
                    className="action-row"
                    onClick={() => setPage("Dataset explorer")}
                  >
                    <span className="action-symbol violet">
                      <Database size={18} />
                    </span>
                    <span>
                      <b>Explore dataset</b>
                      <small>Inspect available records</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>

                  <div className="activity-footer">
                    <StatusLed online />
                    Local-first · Research prototype
                  </div>
                </section>
              </div>

              <div className="disclaimer">
                <ShieldAlert size={16} />
                <p>
                  <b>Research disclaimer</b> — Predictions are model estimates,
                  not proof of deception. Performance may change across
                  platforms, domains and review styles.
                </p>
              </div>
            </>
          )}

          {page === "Review intelligence" && (
            <>
              <Header
                eyebrow="TEXT CLASSIFICATION / 01"
                title="Review intelligence"
                desc="Submit a review to inspect the model's predicted class and available probability scores."
                action={
                  <span className="muted-pill">
                    <StatusLed online={modelConnected} />
                    {health === null
                      ? "Checking model..."
                      : modelConnected
                        ? "Model ready"
                        : "Model offline"}
                  </span>
                }
              />

              <div className="analysis-grid">
                <section className="panel input-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Review input</h3>
                      <p>Paste text from a hotel or product review</p>
                    </div>
                    <span className="panel-icon">
                      <MessageSquareText size={17} />
                    </span>
                  </div>

                  <textarea
                    maxLength={2000}
                    value={review}
                    onChange={(event) => setReview(event.target.value)}
                    placeholder="Paste a review to analyse..."
                  />

                  <div className="input-meta">
                    <span>{review.length}/2,000 characters</span>
                    <span>
                      {review.trim() ? review.trim().split(/\s+/).length : 0}{" "}
                      words
                    </span>
                  </div>

                  {error && <div className="error-box">{error}</div>}

                  <div className="input-buttons">
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        setReview("");
                        setResult(null);
                        setError("");
                      }}
                    >
                      Clear
                    </button>
                    <button
                      className="primary-btn"
                      disabled={busy || !modelConnected}
                      onClick={predict}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ScanSearch size={16} />
                      )}
                      Analyse review
                    </button>
                  </div>

                  <div className="privacy-note">
                    <ShieldCheck size={15} />
                    Text is processed by your local backend.
                  </div>
                </section>

                <section className="panel result-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Prediction report</h3>
                      <p>Classification and confidence</p>
                    </div>
                    <span className="panel-icon">
                      <Activity size={17} />
                    </span>
                  </div>

                  {result ? (
                    <>
                      <div
                        className={`prediction-banner ${
                          result.label === "Fake" ? "fake" : "genuine"
                        }`}
                      >
                        <div className="prediction-symbol">
                          {result.label === "Fake" ? (
                            <ShieldAlert size={23} />
                          ) : (
                            <ShieldCheck size={23} />
                          )}
                        </div>
                        <div>
                          <small>MODEL PREDICTION</small>
                          <h2>{result.label}</h2>
                          <span>
                            {result.confidence == null
                              ? "Probability unavailable"
                              : `${result.confidence}% model confidence`}
                          </span>
                        </div>
                        <span className="prediction-chip">
                          {result.label === "Fake" ? "FLAGGED" : "GENUINE"}
                        </span>
                      </div>

                      <h4>Class probability</h4>

                      {Object.keys(result.probabilities || {}).length ? (
                        Object.entries(result.probabilities).map(
                          ([label, value]) => (
                            <div className="metric-row" key={label}>
                              <div>
                                <span>{label}</span>
                                <b>{value}%</b>
                              </div>
                              <div className="track">
                                <span
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(0, Number(value) || 0)
                                    )}%`,
                                    background:
                                      label === "Fake"
                                        ? "#e27686"
                                        : "#55c6a1",
                                  }}
                                />
                              </div>
                            </div>
                          )
                        )
                      ) : (
                        <p className="empty-copy">
                          This model does not expose probability scores.
                        </p>
                      )}

                      <div className="result-meta">
                        <div>
                          <small>WORDS</small>
                          <b>{result.words}</b>
                        </div>
                        <div>
                          <small>CHARACTERS</small>
                          <b>{result.characters}</b>
                        </div>
                        <div>
                          <small>ENGINE</small>
                          <b>{metrics.selected_model || "Saved model"}</b>
                        </div>
                      </div>

                      <div className="note-box">
                        <CircleHelp size={16} />
                        <span>
                          Confidence is not a calibrated probability of
                          dishonesty. Interpret alongside context and other
                          evidence.
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="empty-result">
                      <div className="empty-art">
                        <ScanSearch size={36} />
                      </div>
                      <h3>Waiting for a review</h3>
                      <p>
                        Your prediction will appear here with the output class
                        and probability scores provided by the model.
                      </p>
                      <div className="empty-steps">
                        <span>
                          <i>1</i> Enter review text
                        </span>
                        <span>
                          <i>2</i> Run the classifier
                        </span>
                        <span>
                          <i>3</i> Interpret the result
                        </span>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {page === "Batch analysis" && (
            <>
              <Header
                eyebrow="BULK PROCESSING / 02"
                title="Batch analysis"
                desc="Classify multiple reviews in one run and export a labelled results file."
              />

              <section className="panel batch-upload">
                <div className="upload-drop">
                  <div className="upload-icon">
                    <Upload size={24} />
                  </div>
                  <h3>Upload review dataset</h3>
                  <p>
                    CSV file with a <code>review</code> column (or{" "}
                    <code>text</code> / <code>content</code>).
                  </p>

                  <label className="secondary-btn file-label">
                    Choose CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      onChange={(event) => {
                        setFile(event.target.files?.[0] || null);
                        setBatch(null);
                        setError("");
                      }}
                    />
                  </label>

                  {file && (
                    <div className="file-chip">
                      <FileText size={16} />
                      {file.name}
                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  )}

                  <button
                    className="primary-btn"
                    disabled={!file || busy}
                    onClick={runBatch}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Activity size={16} />
                    )}
                    Run batch analysis
                  </button>
                </div>

                <div className="upload-guidance">
                  <h4>Before you upload</h4>
                  <div>
                    <Check size={15} /> Include a header row
                  </div>
                  <div>
                    <Check size={15} /> Use one review per row
                  </div>
                  <div>
                    <Check size={15} /> Blank reviews are skipped
                  </div>
                  <div>
                    <Check size={15} /> Existing labels are preserved as source columns
                  </div>
                  <div className="mini-code">
                    review,source
                    <br />
                    "The staff were lovely",hotel
                    <br />
                    "Best purchase ever!!!",product
                  </div>
                </div>
              </section>

              {error && <div className="error-box">{error}</div>}

              {batch && (
                <>
                  <div className="stats-grid batch-stats">
                    <Stat
                      icon={Database}
                      label="Analysed"
                      value={batch.count ?? batch.rows?.length ?? 0}
                      sub={`${batch.skipped ?? 0} skipped`}
                    />
                    <Stat
                      icon={ShieldCheck}
                      label="Genuine predictions"
                      value={batch.genuine ?? 0}
                      sub="Model output"
                      tone="green"
                    />
                    <Stat
                      icon={ShieldAlert}
                      label="Fake predictions"
                      value={batch.fake ?? 0}
                      sub="Model output"
                      tone="rose"
                    />
                    <Stat
                      icon={Gauge}
                      label="Flagged share"
                      value={
                        batch.count
                          ? `${(
                              (batch.fake / batch.count) *
                              100
                            ).toFixed(1)}%`
                          : "—"
                      }
                      sub="Of valid rows"
                      tone="violet"
                    />
                  </div>

                  <section className="panel table-panel">
                    <div className="panel-head">
                      <div>
                        <h3>Prediction results</h3>
                        <p>{batch.count} reviews processed</p>
                      </div>
                      <button
                        className="secondary-btn"
                        onClick={downloadBatch}
                      >
                        <ArrowDownToLine size={15} /> Export CSV
                      </button>
                    </div>

                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {Object.keys(batch.rows?.[0] || {}).map((key) => (
                              <th key={key}>
                                {key.replaceAll("_", " ")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(batch.rows || []).slice(0, 100).map((row, index) => (
                            <tr key={index}>
                              {Object.keys(batch.rows?.[0] || {}).map((key) => (
                                <td key={key}>
                                  {key === "prediction" ? (
                                    <span
                                      className={`label-pill ${
                                        row[key] === "Fake"
                                          ? "label-fake"
                                          : "label-genuine"
                                      }`}
                                    >
                                      {row[key]}
                                    </span>
                                  ) : (
                                    String(row[key] ?? "").slice(0, 150)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {batch.count > 100 && (
                      <p className="small-note">
                        Showing the first 100 rows. Export the CSV for the
                        complete result.
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {page === "Model laboratory" && (
            <>
              <Header
                eyebrow="EVALUATION / 03"
                title="Model laboratory"
                desc="Inspect the saved model evaluation and compare key classification metrics."
                action={
                  <span className="muted-pill">
                    <StatusLed online={modelConnected} />
                    {modelConnected ? "Model loaded" : "Model status unavailable"}
                  </span>
                }
              />

              <div className="stats-grid">
                <Stat
                  icon={Gauge}
                  label="Test accuracy"
                  value={formatPercent(metrics.test_accuracy ?? 0.88125)}
                  sub="Overall correct predictions"
                  tone="violet"
                />
                <Stat
                  icon={ShieldCheck}
                  label="Fake precision"
                  value={formatPercent(
                    metrics.test_precision_fake ?? 0.8388888889
                  )}
                  sub="Predicted fake that were fake"
                  tone="blue"
                />
                <Stat
                  icon={Activity}
                  label="Fake recall"
                  value={formatPercent(metrics.test_recall_fake ?? 0.94375)}
                  sub="Fake reviews detected"
                  tone="green"
                />
                <Stat
                  icon={FlaskConical}
                  label="Fake F1-score"
                  value={formatPercent(
                    metrics.test_f1_fake ?? 0.8882352941
                  )}
                  sub="Precision-recall balance"
                  tone="rose"
                />
              </div>

              <div className="overview-grid lab-grid">
                <section className="panel chart-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Metric comparison</h3>
                      <p>Saved held-out test results</p>
                    </div>
                  </div>

                  <div className="chart-wrap tall">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          {
                            metric: "Accuracy",
                            value:
                              Number(metrics.test_accuracy ?? 0.88125) * 100,
                          },
                          {
                            metric: "Precision",
                            value:
                              Number(
                                metrics.test_precision_fake ?? 0.8388888889
                              ) * 100,
                          },
                          {
                            metric: "Recall",
                            value:
                              Number(metrics.test_recall_fake ?? 0.94375) *
                              100,
                          },
                          {
                            metric: "F1-score",
                            value:
                              Number(metrics.test_f1_fake ?? 0.8882352941) *
                              100,
                          },
                        ]}
                        margin={{ top: 15, right: 10, left: -15, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#243047"
                        />
                        <XAxis
                          dataKey="metric"
                          tick={{ fill: "#93a1b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "#93a1b8", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          formatter={(value) => [
                            `${Number(value).toFixed(2)}%`,
                            "Score",
                          ]}
                        />
                        <Bar
                          dataKey="value"
                          name="Score"
                          fill="#8b9bff"
                          radius={[5, 5, 0, 0]}
                          barSize={38}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="panel details-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Evaluation details</h3>
                      <p>Recorded training output</p>
                    </div>
                  </div>

                  {[
                    [
                      "Selected classifier",
                      metrics.selected_model || "Naive Bayes",
                    ],
                    ["Held-out test examples", metrics.test_examples ?? 320],
                    [
                      "Fake-class precision",
                      formatPercent(metrics.test_precision_fake ?? 0.8388888889),
                    ],
                    [
                      "Fake-class recall",
                      formatPercent(metrics.test_recall_fake ?? 0.94375),
                    ],
                    [
                      "Fake-class F1",
                      formatPercent(metrics.test_f1_fake ?? 0.8882352941),
                    ],
                  ].map(([label, value]) => (
                    <div className="detail-row" key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                    </div>
                  ))}

                  <div className="note-box">
                    <CircleHelp size={16} />
                    <span>
                      Only report comparisons when their corresponding saved
                      validation results are available. Do not treat
                      validation scores as test scores.
                    </span>
                  </div>
                </section>
              </div>

              <section className="panel methodology">
                <div className="panel-head">
                  <div>
                    <h3>How to interpret these metrics</h3>
                    <p>Evaluation language for your project report and viva</p>
                  </div>
                </div>

                <div className="method-grid">
                  <div>
                    <b>Accuracy</b>
                    <p>
                      Share of all held-out examples classified correctly.
                    </p>
                  </div>
                  <div>
                    <b>Precision</b>
                    <p>
                      Among reviews predicted fake, the share labelled fake in
                      the test set.
                    </p>
                  </div>
                  <div>
                    <b>Recall</b>
                    <p>
                      Among fake-labelled test reviews, the share detected by
                      the model.
                    </p>
                  </div>
                  <div>
                    <b>F1-score</b>
                    <p>
                      Harmonic mean of precision and recall for the fake class.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          {page === "Dataset explorer" && (
            <>
              <Header
                eyebrow="DATA / 04"
                title="Dataset explorer"
                desc="Inspect the labelled review corpus used by the project."
              />

              <div className="stats-grid">
                <Stat
                  icon={Database}
                  label="Total records"
                  value={(overview?.total ?? 1596).toLocaleString()}
                  sub="Loaded from reviews.csv"
                />
                <Stat
                  icon={ShieldCheck}
                  label="Genuine labels"
                  value={overview?.genuine ?? 796}
                  sub="49.87%"
                  tone="green"
                />
                <Stat
                  icon={ShieldAlert}
                  label="Fake labels"
                  value={overview?.fake ?? 800}
                  sub="50.13%"
                  tone="rose"
                />
                <Stat
                  icon={Activity}
                  label="Duplicate check"
                  value="0*"
                  sub="Previously reported check"
                  tone="violet"
                />
              </div>

              <section className="panel table-panel">
                <div className="panel-head">
                  <div>
                    <h3>Dataset preview</h3>
                    <p>
                      First available records · review text is truncated in
                      the table
                    </p>
                  </div>

                  <div className="search-box">
                    <Search size={15} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search sample..."
                    />
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(sample[0] || { review: "", label: "" }).map(
                          (key) => (
                            <th key={key}>{key}</th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSample.map((row, index) => (
                        <tr key={index}>
                          {Object.keys(sample[0] || row).map((key) => (
                            <td key={key}>
                              {key === "label" ? (
                                <span
                                  className={`label-pill ${
                                    String(row[key]).toLowerCase() === "fake"
                                      ? "label-fake"
                                      : "label-genuine"
                                  }`}
                                >
                                  {row[key]}
                                </span>
                              ) : (
                                String(row[key] ?? "").slice(0, 220)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {datasetError && (
                    <div className="error-box">{datasetError}</div>
                  )}

                  {!sample.length && !datasetError && (
                    <div className="empty-table">
                      No dataset preview available. Check the configured
                      reviews.csv path in the backend.
                    </div>
                  )}

                  {sample.length > 0 && filteredSample.length === 0 && (
                    <div className="empty-table">
                      No sample rows match your search.
                    </div>
                  )}
                </div>

                <p className="small-note">
                  The API exposes only a small preview, not the full corpus.
                  The duplicate count shown above reflects the previously
                  reported dataset check.
                </p>
              </section>
            </>
          )}

          {page === "Reports & about" && (
            <>
              <Header
                eyebrow="PROJECT / 05"
                title="About ReviewLens"
                desc="An academic machine-learning prototype for identifying patterns associated with deceptive review text."
              />

              <section className="panel about-hero">
                <div className="about-mark">
                  <ScanSearch size={32} />
                </div>
                <div>
                  <div className="eyebrow">
                    B.TECH · ARTIFICIAL INTELLIGENCE & DATA SCIENCE
                  </div>
                  <h2>Fake Review Prediction Model</h2>
                  <p>
                    ReviewLens provides a user interface for single-review
                    classification, batch CSV inference and inspection of
                    stored evaluation metrics. It is intended for
                    experimentation and academic demonstration.
                  </p>
                </div>
              </section>

              <div className="overview-grid about-grid">
                <section className="panel details-panel">
                  <h3>System components</h3>
                  {[
                    ["Frontend", "React + Vite"],
                    ["Backend", "Python FastAPI"],
                    ["ML inference", "Existing scikit-learn artifact"],
                    ["Dataset", "Labelled reviews CSV"],
                    ["Visual analytics", "Recharts"],
                  ].map(([label, value]) => (
                    <div className="detail-row" key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                    </div>
                  ))}
                </section>

                <section className="panel details-panel">
                  <h3>Responsible use</h3>
                  <p className="body-copy">
                    A classifier may learn writing style, dataset-specific
                    patterns, or source artefacts rather than deception itself.
                    False positives and false negatives are possible.
                  </p>
                  <p className="body-copy">
                    Do not use the prediction alone to accuse a reviewer,
                    remove content, or make high-impact decisions. Evaluate on
                    representative, independently collected data before
                    real-world use.
                  </p>
                  <button
                    className="secondary-btn"
                    onClick={() => setPage("Model laboratory")}
                  >
                    Review evaluation <ChevronRight size={15} />
                  </button>
                </section>
              </div>

              <div className="disclaimer">
                <ShieldAlert size={16} />
                <p>
                  <b>Research limitation</b> — The dataset is small and
                  domain-specific. Report the data source, split method,
                  preprocessing, label definitions and known limitations in
                  your final documentation.
                </p>
              </div>
            </>
          )}

          <footer className="footer">
            <div>
              <span className="footer-mark">
                <ScanSearch size={15} />
              </span>{" "}
              <b>ReviewLens</b>
              <span> · Academic research prototype</span>
            </div>
            <span>Predictions are estimates, not proof of deception.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
