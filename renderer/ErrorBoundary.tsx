import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

type ErrorBoundaryProps = React.PropsWithChildren<Record<string, unknown>>;

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: "#111",
            color: "#f88",
            padding: "1rem",
            height: "100vh",
          }}
        >
          <h2>Something went wrong.</h2>
          <pre>{this.state.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
