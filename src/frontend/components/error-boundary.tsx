"use client";

import { Component, type PropsWithChildren, type ReactNode } from "react";

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
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
