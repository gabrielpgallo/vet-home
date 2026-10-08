"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { LoaderCircle, Search } from "lucide-react";
import { MaskedInput } from "./masked-input";
import {
  brazilianStates,
  mergePostalAddress,
  normalizeCep,
  postalAddressSchema,
  type TutorAddress,
} from "@/lib/address";

export function AddressFields({
  value,
  onChange,
  onBusyChange,
}: {
  value: TutorAddress;
  onChange: Dispatch<SetStateAction<TutorAddress>>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const id = useId();
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function cancel() {
    sequence.current++;
    controller.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }
  function search(started: TutorAddress, delay = 0) {
    cancel();
    const cep = normalizeCep(started.postalCode);
    if (!/^\d{8}$/.test(cep)) {
      setBusy(false);
      onBusyChange(false);
      setMessage(cep ? "Informe os 8 dígitos do CEP para buscar." : "");
      return;
    }
    const request = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusyChange(true);
    setMessage("Buscando endereço…");
    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/postal-codes/${cep}`, {
          signal: abort.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Não foi possível consultar este CEP.");
        const found = postalAddressSchema.parse(body);
        if (request !== sequence.current) return;
        onChange((current) => mergePostalAddress(current, found, started));
        setMessage(
          found.street
            ? "Endereço preenchido. Confira os dados e complete número e complemento."
            : "CEP localizado. Complete a rua, o número e os demais dados do endereço.",
        );
      } catch (error) {
        if (request !== sequence.current || abort.signal.aborted) return;
        setMessage(
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "Não foi possível buscar o CEP. Você pode preencher o endereço manualmente.",
        );
      } finally {
        if (request === sequence.current) {
          setBusy(false);
          onBusyChange(false);
        }
      }
    }, delay);
  }
  return (
    <div className="address-fields">
      <div className="address-cep-row">
        <label>
          CEP (opcional)
          <MaskedInput
            mask="cep"
            name="postalCode"
            value={value.postalCode}
            autoComplete="postal-code"
            maxLength={10}
            placeholder="00000-000"
            aria-describedby={`${id}-status`}
            onValueChange={(postalCode) => {
              onChange((current) => ({ ...current, postalCode }));
              if (normalizeCep(postalCode) !== normalizeCep(value.postalCode))
                search({ ...value, postalCode }, 350);
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !/^\d{8}$/.test(normalizeCep(value.postalCode))}
          onClick={() => search(value)}
        >
          {busy ? (
            <LoaderCircle
              size={16}
              className="address-loading"
              aria-hidden="true"
            />
          ) : (
            <Search size={16} aria-hidden="true" />
          )}
          {busy ? "Buscando…" : "Buscar CEP"}
        </button>
      </div>
      <p id={`${id}-status`} className="hint address-status" role="status">
        {message ||
          "Ao completar o CEP, buscamos rua, bairro, cidade e UF. Todos os campos continuam editáveis."}
      </p>
      <div className="form-grid">
        <label className="address-street">
          Rua / logradouro
          <input
            name="street"
            value={value.street}
            required
            maxLength={180}
            autoComplete="address-line1"
            onChange={(e) =>
              onChange((current) => ({ ...current, street: e.target.value }))
            }
          />
        </label>
        <label>
          Número
          <input
            name="addressNumber"
            value={value.number}
            maxLength={30}
            placeholder="Ex.: 120 ou s/n"
            onChange={(e) =>
              onChange((current) => ({ ...current, number: e.target.value }))
            }
          />
        </label>
        <label>
          Complemento
          <input
            name="complement"
            value={value.complement}
            maxLength={100}
            autoComplete="address-line2"
            placeholder="Apartamento, bloco, casa…"
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                complement: e.target.value,
              }))
            }
          />
        </label>
        <label>
          Bairro
          <input
            name="neighborhood"
            value={value.neighborhood}
            maxLength={100}
            autoComplete="address-level3"
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                neighborhood: e.target.value,
              }))
            }
          />
        </label>
        <div className="address-locality">
          <label>
            Cidade
            <input
              name="city"
              value={value.city}
              maxLength={100}
              autoComplete="address-level2"
              onChange={(e) =>
                onChange((current) => ({ ...current, city: e.target.value }))
              }
            />
          </label>
          <label>
            UF
            <select
              name="state"
              value={value.state}
              autoComplete="address-level1"
              onChange={(e) =>
                onChange((current) => ({ ...current, state: e.target.value }))
              }
            >
              <option value="">—</option>
              {brazilianStates.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
