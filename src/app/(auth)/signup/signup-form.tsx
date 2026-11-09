"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { signupAction, type ActionState } from "@/lib/actions/auth-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating your workspace…" : "Create account"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState<ActionState | undefined, FormData>(
    signupAction,
    undefined,
  );

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
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
              autoComplete="new-password"
              required
              minLength={10}
              aria-invalid={Boolean(state?.fieldErrors?.password)}
              aria-describedby="password-hint"
            />
            {state?.fieldErrors?.password ? (
              <FieldError id="password-error">{state.fieldErrors.password}</FieldError>
            ) : (
              <p id="password-hint" className="text-xs text-fg-subtle">
                At least 10 characters.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspaceName">
              Company <span className="font-normal text-fg-subtle">(optional)</span>
            </Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              type="text"
              autoComplete="organization"
              placeholder="Acme"
            />
            <p className="text-xs text-fg-subtle">
              Names your first workspace. You can rename it later.
            </p>
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
