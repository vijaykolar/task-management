import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { Link, useParams } from "react-router";

import { AuthHeading } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser, useVerifyEmail } from "@/features/auth/hooks";

/** Public page: the link in the verification email points here */
export function VerifyEmailPage() {
  const { verificationToken } = useParams();
  const verification = useVerifyEmail(verificationToken);
  const { data: user } = useCurrentUser();

  const continueLink = user ? "/" : "/login";
  const continueLabel = user ? "Go to dashboard" : "Continue to sign in";

  if (verification.isPending) {
    return (
      <div className="flex flex-col items-center text-center">
        <Spinner className="mb-6 size-8 text-muted-foreground" />
        <AuthHeading
          title="Verifying your email"
          description="This will only take a moment…"
        />
      </div>
    );
  }

  if (verification.isError) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <XCircleIcon className="size-7" />
        </div>
        <AuthHeading
          title="Verification failed"
          description={`${verification.error.message}. Verification links expire after 20 minutes and can only be used once.`}
        />
        <Button asChild size="lg" className="w-full">
          <Link to="/resend-verification">Send a new link</Link>
        </Button>
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link to={user ? "/" : "/login"}>
            {user ? "Go to dashboard" : "Back to sign in"}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
        <CheckCircle2Icon className="size-7" />
      </div>
      <AuthHeading
        title="Email verified"
        description={
          verification.data.data.joinedProjects > 0
            ? `Thanks! Your email is confirmed and you've joined ${verification.data.data.joinedProjects} project${verification.data.data.joinedProjects === 1 ? "" : "s"} you were invited to.`
            : "Thanks! Your email address has been confirmed."
        }
      />
      <Button asChild size="lg" className="w-full">
        <Link to={continueLink}>{continueLabel}</Link>
      </Button>
    </div>
  );
}
