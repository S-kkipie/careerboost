"use client";

import {
    Component,
    type ErrorInfo,
    type PropsWithChildren,
    type ReactNode,
} from "react";

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // TODO(spec-01+): replace with monitoring (e.g. Sentry.captureException)
        console.error("[ErrorBoundary]", error, info.componentStack);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-destructive">
                    Algo salió mal. Recarga la página.
                </div>
            );
        }
        return this.props.children;
    }
}
