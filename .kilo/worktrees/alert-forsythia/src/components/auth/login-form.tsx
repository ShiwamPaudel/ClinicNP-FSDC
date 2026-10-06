"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { loginBlockStatus } from "@/app/(auth)/actions";
import { strings } from "@/lib/strings";

interface FormValues {
  username: string;
  password: string;
}

/**
 * login-form.tsx — the half of the sign-in screen that is about this clinic.
 *
 * The clinic's own letterhead sits above the fields, so somebody looking at a
 * shared machine can see whose system this is before they type anything into
 * it. Everything else on the screen belongs to the software; this part belongs
 * to them.
 */
export function LoginForm({
  clinicName,
  clinicLogoUrl,
}: {
  clinicName: string;
  clinicLogoUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const res = await signIn("password", {
      username: values.username,
      password: values.password,
      redirect: false,
    });
    setSubmitting(false);
    if (res?.error) {
      // Distinguish a lockout from wrong credentials for a clearer message.
      const status = await loginBlockStatus(values.username);
      if (status.blocked) {
        const mins = Math.ceil(status.retryAfterSec / 60);
        toast.error(
          `Too many attempts. Please wait about ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
        );
      } else {
        toast.error(strings.wrongLogin);
      }
      return;
    }
    // "/" decides where this person belongs — the counter for most, their own
    // list for a doctor. The browser cannot know which, so it does not guess.
    router.push("/");
    router.refresh();
  }

  return (
    <section className="order-1 flex items-center justify-center bg-cream-100 px-6 py-10 sm:px-10 lg:order-2 lg:py-12">
      <div className="w-full max-w-[380px]">
        {/* Whose counter this is. */}
        <div className="mb-8">
          {clinicLogoUrl ? (
            <div className="rounded-[10px] border border-line bg-cream-50 p-4">
              {/* The letterhead is uploaded by the clinic and can be any
                  proportion, so it is contained rather than cropped. It is a
                  data URL held in their settings, not a file on disk. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clinicLogoUrl}
                alt={clinicName || "Clinic letterhead"}
                className="mx-auto max-h-[86px] w-full object-contain"
              />
            </div>
          ) : clinicName ? (
            <div className="rounded-[10px] border border-line bg-cream-50 px-4 py-5 text-center">
              <p className="font-display text-[19px] font-bold leading-snug text-sage-900">
                {clinicName}
              </p>
            </div>
          ) : null}
        </div>

        <h2 className="font-display text-[26px] font-bold leading-none text-sage-950">
          {strings.login}
        </h2>
        <p className="mt-2 text-[13.5px] text-sage-500">
          Use the username and password you were given.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-7">
          <div className="flex flex-col gap-4">
            <Field
              label={strings.username}
              htmlFor="username"
              error={errors.username && "Enter your username"}
            >
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                invalid={!!errors.username}
                {...register("username", { required: true })}
              />
            </Field>

            <Field
              label={strings.password}
              htmlFor="password"
              error={errors.password && "Enter your password"}
            >
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  invalid={!!errors.password}
                  className="pr-11"
                  {...register("password", { required: true })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[8px] text-sage-500 hover:text-sage-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-700"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye aria-hidden="true" className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </Field>

            <Button
              type="submit"
              size="pos"
              disabled={submitting}
              className="mt-2 w-full"
            >
              {submitting ? (
                "Logging in…"
              ) : (
                <>
                  <LogIn aria-hidden="true" className="h-[18px] w-[18px]" />
                  {strings.login}
                </>
              )}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-[12.5px] leading-relaxed text-sage-500">
          Accounts are set up by the owner under Settings. There is no public
          sign-up — ask them for one, or to reset a password you have forgotten.
        </p>
      </div>
    </section>
  );
}
