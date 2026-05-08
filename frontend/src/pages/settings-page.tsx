import type { ReactNode } from "react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpen, RotateCcw, Save } from "lucide-react";

import { Button } from "../components/ui/button";
import { compactFileLabel } from "../lib/utils";
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
    <div className="settings-page">
      <aside className="summary-pane">
        <div className="panel-title">当前配置</div>
        <div className="panel-caption">保存后应用于后续任务</div>
        <div className="mt-5 grid gap-2">
          <SummaryRow label="默认模型" value={values.modelId ?? "-"} />
          <SummaryRow label="设备策略" value={values.devicePreference ?? "-"} />
          <SummaryRow label="语言" value={values.language ?? "-"} />
          <SummaryRow label="临时文件" value={values.tempPolicy ?? "-"} />
          <SummaryRow label="输出目录" value={compactFileLabel(values.outputDir ?? "-", 32)} />
        </div>
      </aside>

      <form
        className="settings-form"
        onSubmit={form.handleSubmit(async (nextValues) => {
          await saveSettings({
            ...nextValues,
            modelPath: nextValues.modelPath?.trim() || undefined,
            ffmpegPath: nextValues.ffmpegPath?.trim() || undefined,
          });
        })}
      >
        <SettingsGroup title="路径">
          <Field label="默认输出目录" error={form.formState.errors.outputDir?.message}>
            <div className="input-action">
              <input
                {...form.register("outputDir")}
                className="field compact-field"
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
                <FolderOpen className="h-4 w-4" />
                选择
              </Button>
            </div>
          </Field>

          <Field label="模型目录" error={form.formState.errors.modelPath?.message}>
            <div className="input-action">
              <input {...form.register("modelPath")} className="field compact-field" placeholder="默认应用模型目录" />
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
                <FolderOpen className="h-4 w-4" />
                选择
              </Button>
            </div>
          </Field>

          <Field label="ffmpeg 路径" error={form.formState.errors.ffmpegPath?.message}>
            <input {...form.register("ffmpegPath")} className="field compact-field" placeholder="留空则从 PATH 自动检测" />
          </Field>
        </SettingsGroup>

        <SettingsGroup title="转写与运行">
          <div className="settings-grid">
            <Field label="默认模型" error={form.formState.errors.modelId?.message}>
              <input {...form.register("modelId")} className="field compact-field" placeholder="medium" />
            </Field>

            <Field label="语言代码" error={form.formState.errors.language?.message}>
              <input {...form.register("language")} className="field compact-field" placeholder="zh" />
            </Field>
          </div>

          <div className="settings-grid">
            <Field label="设备策略" error={form.formState.errors.devicePreference?.message}>
              <select {...form.register("devicePreference")} className="field compact-field">
                <option value="auto">自动</option>
                <option value="cuda">优先 CUDA</option>
                <option value="cpu">仅 CPU</option>
              </select>
            </Field>

            <Field label="并发数" error={form.formState.errors.concurrency?.message}>
              <select {...form.register("concurrency", { valueAsNumber: true })} className="field compact-field" disabled>
                <option value={1}>1</option>
              </select>
            </Field>

            <Field label="临时文件策略" error={form.formState.errors.tempPolicy?.message}>
              <select {...form.register("tempPolicy")} className="field compact-field">
                <option value="cleanup_after_success">任务后清理</option>
                <option value="keep_all">保留中间文件</option>
              </select>
            </Field>
          </div>
        </SettingsGroup>

        <div className="settings-actions">
          <Button type="submit">
            <Save className="h-4 w-4" />
            保存设置
          </Button>
          <Button variant="ghost" type="button" onClick={() => form.reset(settings)}>
            <RotateCcw className="h-4 w-4" />
            还原
          </Button>
        </div>
      </form>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <div className="panel-title">{title}</div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
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
    <label className="field-row">
      <span className="field-label">{label}</span>
      <span className="min-w-0 flex-1">
        {children}
        {error ? <span className="mt-1 block text-xs text-[var(--danger)]">{error}</span> : null}
      </span>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong title={String(value)}>{value}</strong>
    </div>
  );
}
