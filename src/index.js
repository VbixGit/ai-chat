import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error("Unhandled error in App:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#a00" }}>Application Error</h2>
          <div>
            <strong>Error:</strong>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {String(this.state.error)}
            </pre>
          </div>
          <div>
            <strong>Stack:</strong>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {this.state.info?.componentStack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
