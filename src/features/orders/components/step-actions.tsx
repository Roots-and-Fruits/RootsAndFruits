import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderActionBar } from "./order-action-bar";

export function StepActions({
  onBack,
  onNext,
  disabled,
  label = "다음",
  submit = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  disabled?: boolean;
  label?: string;
  submit?: boolean;
}) {
  return (
    <OrderActionBar>
      <div className="flex items-center gap-3">
        {onBack && (
          <Button
            variant="outline"
            type="button"
            onClick={onBack}
            className="h-13 rounded-xl px-5"
          >
            <ArrowLeft className="size-4" />
            이전
          </Button>
        )}
        <Button
          type={submit ? "submit" : "button"}
          onClick={onNext}
          disabled={disabled}
          className="h-13 flex-1 rounded-xl px-6 text-base"
        >
          {label}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </OrderActionBar>
  );
}
