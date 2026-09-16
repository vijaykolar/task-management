import { MailWarningIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useResendEmailVerification } from "@/features/auth/hooks";

export function EmailVerificationBanner({ email }: { email: string }) {
  const resend = useResendEmailVerification();

  return (
    <div className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:px-6">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
        <MailWarningIcon className="size-4 shrink-0" />
        <span>
          Please verify your email address{" "}
          <span className="font-medium">{email}</span>.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="sm:ml-auto"
        onClick={() => resend.mutate(email)}
        disabled={resend.isPending || resend.isSuccess}
      >
        {resend.isPending && <Spinner />}
        {resend.isSuccess ? "Email sent" : "Resend verification email"}
      </Button>
    </div>
  );
}
