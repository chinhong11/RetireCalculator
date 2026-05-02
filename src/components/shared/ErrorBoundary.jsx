import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        padding: 24, borderRadius: 12,
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.2)",
      }}>
        <div style={{ color: "#f87171", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>
          Something went wrong in this tab
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, fontFamily: "monospace", lineHeight: 1.6 }}>
          {error.message}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            fontSize: 12, fontWeight: 600,
            color: "var(--accent)", background: "transparent",
            border: "1px solid var(--accent-border-c)",
            borderRadius: 6, padding: "5px 12px", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
