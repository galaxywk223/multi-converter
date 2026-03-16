import type { ReactNode } from "react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";
import { useAppStore } from "../store/app-store";

const settingsSchema = z.object({
  outputDir: z.string().min(1, "请选择默认输出目录"),
  modelId: z.string().min(1, "模型名不能为空"),
  modelPath: z.string().optional(),
  language: z.string().min(2, "语言代码不能为空"),
  devicePreference: z.enum(["auto", "cpu", "cuda"]),
  ffmpegPath: z.string().optional(),
  concurrency: z.literal(1),
  tempPolicy: z.enum(["cleanup_after_success", "keep_all"]),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const environment = useAppStore((state) => state.environment);
  const saveSettings = useAppStore((state) => state.saveSettings);
  const chooseOutputDir = useAppStore((state) => state.chooseOutputDir);
  const chooseModelDir = useAppStore((state) => state.chooseModelDir);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });

  useEffect(() => {
    form.reset({
      ...settings,
      outputDir: settings.outputDir || "",
      modelPath: settings.modelPath || environment?.defaultModelDir || "",
      ffmpegPath: settings.ffmpegPath || environment?.ffmpegPath || "",
    });
  }, [environment?.defaultModelDir, environment?.ffmpegPath, form, settings]);

  const values = useWatch({ control: form.control });

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardTitle>运行默认值</CardTitle>
        <CardDescription className="mt-2">当前默认配置。</CardDescription>
        <div className="mt-6 grid gap-3 text-sm text-[var(--muted-foreground)]">
          <SummaryRow label="默认模型" value={values.modelId ?? "-"} />
          <SummaryRow label="设备策略" value={values.devicePreference ?? "-"} />
          <SummaryRow label="语言" value={values.language ?? "-"} />
          <SummaryRow label="临时文件" value={values.tempPolicy ?? "-"} />
          <SummaryRow label="ffmpeg" value={values.ffmpegPath || "PATH 自动检测"} />
        </div>
      </Card>

      <Card>
        <CardTitle>设置</CardTitle>
        <CardDescription className="mt-2">仅影响新任务。</CardDescription>

        <form
          className="mt-6 grid gap-5"
          onSubmit={form.handleSubmit(async (nextValues) => {
            await saveSettings({
              ...nextValues,
              modelPath: nextValues.modelPath?.trim() || undefined,
              ffmpegPath: nextValues.ffmpegPath?.trim() || undefined,
            });
          })}
        >
          <Field label="默认输出目录" error={form.formState.errors.outputDir?.message}>
            <div className="flex gap-3">
                <input
                  {...form.register("outputDir")}
                  className="field"
                  placeholder="例如 C:\\Users\\wangk\\Documents\\MultiConverter"
                />
              <Button
                variant="secondary"
                type="button"
                onClick={async () => {
                  await chooseOutputDir();
                  form.setValue("outputDir", useAppStore.getState().draft.outputDir, {
                    shouldValidate: true,
                  });
                }}
              >
                选择
              </Button>
            </div>
          </Field>

          <Field label="模型目录" error={form.formState.errors.modelPath?.message}>
            <div className="flex gap-3">
              <input {...form.register("modelPath")} className="field" placeholder="默认应用模型目录" />
              <Button
                variant="secondary"
                type="button"
                onClick={async () => {
                  await chooseModelDir();
                  form.setValue("modelPath", useAppStore.getState().settings.modelPath ?? "", {
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

          <Field label="默认模型" error={form.formState.errors.modelId?.message}>
            <input {...form.register("modelId")} className="field" placeholder="medium" />
          </Field>

          <Field label="ffmpeg 路径" error={form.formState.errors.ffmpegPath?.message}>
            <input {...form.register("ffmpegPath")} className="field" placeholder="留空则从 PATH 自动检测" />
          </Field>

          <div className="grid gap-5 md:grid-cols-3">
            <Field label="设备策略" error={form.formState.errors.devicePreference?.message}>
              <select {...form.register("devicePreference")} className="field">
                <option value="auto">自动</option>
                <option value="cuda">优先 CUDA</option>
                <option value="cpu">仅 CPU</option>
              </select>
            </Field>

            <Field label="并发数" error={form.formState.errors.concurrency?.message}>
              <select {...form.register("concurrency", { valueAsNumber: true })} className="field" disabled>
                <option value={1}>1</option>
              </select>
            </Field>

            <Field label="临时文件策略" error={form.formState.errors.tempPolicy?.message}>
              <select {...form.register("tempPolicy")} className="field">
                <option value="cleanup_after_success">任务后清理</option>
                <option value="keep_all">保留中间文件</option>
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
      <div className="mt-2 break-all text-sm text-[var(--foreground)]">{value}</div>
    </div>
  );
}
