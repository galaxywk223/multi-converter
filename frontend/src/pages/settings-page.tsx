import type { ReactNode } from "react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";
import { useAppStore } from "../store/app-store";

const settingsSchema = z.object({
  defaultOutputDir: z.string().min(1, "请选择默认输出目录"),
  language: z.string().min(2, "语言代码不能为空"),
  modelName: z.string().min(1, "模型名不能为空"),
  device: z.enum(["auto", "cpu", "cuda"]),
  concurrency: z.literal(1),
  tempPolicy: z.enum(["cleanup", "retain"]),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const environment = useAppStore((state) => state.environment);
  const saveSettings = useAppStore((state) => state.saveSettings);
  const chooseOutputDir = useAppStore((state) => state.chooseOutputDir);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });

  useEffect(() => {
    form.reset({
      ...settings,
      defaultOutputDir: settings.defaultOutputDir || environment?.defaultModelDir || "",
    });
  }, [environment?.defaultModelDir, form, settings]);

  const values = useWatch({ control: form.control });

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardTitle>运行默认值</CardTitle>
        <CardDescription className="mt-2">
          这里保存桌面端的默认输出、语言、模型和资源策略。第一版固定单并发。
        </CardDescription>
        <div className="mt-6 grid gap-3 text-sm text-[var(--muted-foreground)]">
          <SummaryRow label="默认模型" value={values.modelName ?? "-"} />
          <SummaryRow label="设备策略" value={values.device ?? "-"} />
          <SummaryRow label="语言" value={values.language ?? "-"} />
          <SummaryRow label="临时文件" value={values.tempPolicy ?? "-"} />
        </div>
      </Card>

      <Card>
        <CardTitle>设置</CardTitle>
        <CardDescription className="mt-2">
          这些配置会影响新任务的默认行为，不会修改已经在队列中的作业。
        </CardDescription>

        <form
          className="mt-6 grid gap-5"
          onSubmit={form.handleSubmit((nextValues) => saveSettings(nextValues))}
        >
          <Field label="默认输出目录" error={form.formState.errors.defaultOutputDir?.message}>
            <div className="flex gap-3">
              <input
                {...form.register("defaultOutputDir")}
                className="field"
                placeholder="例如 C:\\Users\\wangk\\Documents\\AudioToText"
              />
              <Button
                variant="secondary"
                type="button"
                onClick={async () => {
                  await chooseOutputDir();
                  const store = useAppStore.getState();
                  form.setValue("defaultOutputDir", store.draft.outputDir, {
                    shouldValidate: true,
                  });
                }}
              >
                选择
              </Button>
            </div>
          </Field>

          <Field label="语言代码" error={form.formState.errors.language?.message}>
            <input {...form.register("language")} className="field" placeholder="zh" />
          </Field>

          <Field label="默认模型" error={form.formState.errors.modelName?.message}>
            <input {...form.register("modelName")} className="field" placeholder="medium" />
          </Field>

          <div className="grid gap-5 md:grid-cols-3">
            <Field label="设备策略" error={form.formState.errors.device?.message}>
              <select {...form.register("device")} className="field">
                <option value="auto">自动</option>
                <option value="cuda">优先 CUDA</option>
                <option value="cpu">仅 CPU</option>
              </select>
            </Field>

            <Field label="并发数" error={form.formState.errors.concurrency?.message}>
              <select {...form.register("concurrency", { valueAsNumber: true })} className="field">
                <option value={1}>1</option>
              </select>
            </Field>

            <Field label="临时文件策略" error={form.formState.errors.tempPolicy?.message}>
              <select {...form.register("tempPolicy")} className="field">
                <option value="cleanup">任务后清理</option>
                <option value="retain">保留中间文件</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">保存设置</Button>
            <Button variant="ghost" type="button" onClick={() => form.reset(settings)}>
              还原
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      {children}
      {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/4 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-2 text-sm text-[var(--foreground)]">{value}</div>
    </div>
  );
}
