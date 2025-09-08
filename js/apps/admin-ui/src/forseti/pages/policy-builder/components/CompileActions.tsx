import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  FormGroup,
  TextInput,
  Button,
  Alert,
  Progress,
  ProgressMeasureLocation,
  ClipboardCopy,
} from "@patternfly/react-core";
import { RocketIcon } from "@patternfly/react-icons";
import { useState, useCallback } from "react";
import type { BuilderState, UploadPayload, UploadResult } from "../../../types/policy-builder-types";
import { defaultPolicyApi } from "../../../utils/policy-api";
import { useTranslation } from "react-i18next";

export function CompileActions({ state }: { state: BuilderState }) {
  const { t } = useTranslation();
  const [assembly, setAssembly] = useState<string>("");
  const [bh, setBh] = useState<string>("");
  const [diag, setDiag] = useState<string>("");
  const [busy, setBusy] = useState<"idle" | "compiling" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [publisherSig, setPublisherSig] = useState("");
  const [uploaded, setUploaded] = useState<UploadResult | null>(null);

  const compile = useCallback(async () => {
    setBusy("compiling"); setError(null); setUploaded(null);
    try {
      const res = await defaultPolicyApi.compile(state, { preferRemote: true });
      setAssembly(res.assemblyBase64); setBh(res.bh); setDiag(res.diagnostics);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("idle");
    }
  }, [state]);

  const upload = useCallback(async () => {
    if (!assembly) { setError("Compile first."); return; }
    setBusy("uploading"); setError(null);
    try {
      const payload: UploadPayload = { assemblyBase64: assembly, entryType: state.entryType, sdkVersion: state.sdkVersion, publisherSig: publisherSig || null };
      const res = await defaultPolicyApi.upload(payload);
      setUploaded(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy("idle");
    }
  }, [assembly, publisherSig, state]);

  return (
    <Card className="pf-v5-u-box-shadow-md">
      <CardHeader><CardTitle className="pf-v5-u-font-size-lg"><RocketIcon className="pf-v5-u-mr-sm" /> {t("forseti.policyBuilder.compileDeploy", "Compile & Deploy")}</CardTitle></CardHeader>
      <CardBody className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
        <FormGroup label={t("forseti.policyBuilder.publisherSig", "Publisher signature (optional)")} fieldId="ca-pub">
          <TextInput id="ca-pub" aria-label="Publisher signature" value={publisherSig} onChange={(_, v) => setPublisherSig(String(v))} />
        </FormGroup>

        <div className="pf-v5-u-display-flex pf-v5-u-gap-sm">
          <Button onClick={compile} isDisabled={busy !== "idle"}>{busy === "compiling" ? t("compiling", "Compiling…") : t("forseti.policyBuilder.compile", "Compile")}</Button>
          <Button variant="primary" onClick={upload} isDisabled={!assembly || busy !== "idle"}>{busy === "uploading" ? t("uploading", "Uploading…") : t("forseti.policyBuilder.upload", "Upload")}</Button>
        </div>

        {busy !== "idle" && <Progress measureLocation={ProgressMeasureLocation.top} title={busy === "compiling" ? t("compiling", "Compiling...") : t("uploading", "Uploading...")} />}

        {error && <Alert isInline variant="danger" title={t("error", "Error")}>{error}</Alert>}

        {diag && (
          <FormGroup label={t("forseti.policyBuilder.diagnostics", "Diagnostics")} fieldId="ca-diag">
            <ClipboardCopy id="ca-diag" isReadOnly variant="expansion">{diag}</ClipboardCopy>
          </FormGroup>
        )}

        {bh && (
          <FormGroup label={t("forseti.policyBuilder.buildHash", "Build hash (bh)")} fieldId="ca-bh">
            <ClipboardCopy id="ca-bh" isReadOnly>{bh}</ClipboardCopy>
          </FormGroup>
        )}

        {assembly && (
          <FormGroup label={t("forseti.policyBuilder.assembly", "Assembly (base64)")} fieldId="ca-asm">
            <ClipboardCopy id="ca-asm" isReadOnly variant="expansion">{assembly}</ClipboardCopy>
          </FormGroup>
        )}

        {uploaded && <Alert isInline variant="success" title={t("forseti.policyBuilder.uploadOk", "Uploaded!")}>{t("forseti.policyBuilder.uploadAck", "Server acknowledged")} <code>{uploaded.bh}</code></Alert>}
      </CardBody>
    </Card>
  );
}
