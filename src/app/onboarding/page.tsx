import { OnboardingWizard } from "@/frontend/components/onboarding/onboarding-wizard";
import { RequireSession } from "@/frontend/components/require-session";

export default function OnboardingPage() {
    return (
        <RequireSession>
            <OnboardingWizard />
        </RequireSession>
    );
}
