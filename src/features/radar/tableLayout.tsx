import type { ReactNode } from "react";
import { useOverflowTitle } from "./useOverflowTitle";

export const COMMITMENT_TABLE_WIDTH = 1514;

export function CommitmentColGroup() {
  return (
    <colgroup>
      <col className="w-[140px]" />
      <col className="w-[240px]" />
      <col className="w-[150px]" />
      <col className="w-[210px]" />
      <col className="w-[120px]" />
      <col className="w-[64px]" />
      <col className="w-[115px]" />
      <col className="w-[90px]" />
      <col className="w-[125px]" />
      <col className="w-[160px]" />
      <col className="w-[100px]" />
    </colgroup>
  );
}

export const OPERATIONAL_TABLE_WIDTH = 1280;

export function OperationalColGroup() {
  return (
    <colgroup>
      <col className="w-[40px]" />
      <col className="w-[150px]" />
      <col className="w-[200px]" />
      <col className="w-[100px]" />
      <col className="w-[170px]" />
      <col className="w-[70px]" />
      <col className="w-[100px]" />
      <col className="w-[150px]" />
      <col className="w-[300px]" />
    </colgroup>
  );
}


export function OverflowText({
  text,
  children,
  className = "",
}: {
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  const { ref, title } = useOverflowTitle<HTMLSpanElement>(text);

  return (
    <span
      ref={ref}
      className={`block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
      title={title}
      tabIndex={title ? 0 : undefined}
    >
      {children ?? text}
    </span>
  );
}
