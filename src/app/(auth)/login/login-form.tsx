"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { loginAction, type ActionState } from "@/lib/actions/auth-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Log in"}
    </Button>
  );
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState<ActionState | undefined, FormData>(
    loginAction,
    undefined,
  );

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              aria-invalid={Boolean(state?.fieldErrors?.email)}
              aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined}
            />
            <FieldError id="email-error">{state?.fieldErrors?.email}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(state?.fieldErrors?.password)}
              aria-describedby={state?.fieldErrors?.password ? "password-error" : undefined}
            />
            <FieldError id="password-error">{state?.fieldErrors?.password}</FieldError>
          </div>

          {state?.error ? (
            <p
              role="alert"
              className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>
      </CardBody>
    </Card>
  );
}
