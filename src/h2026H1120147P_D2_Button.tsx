import type { ComponentProps } from "react";

const variants = {
  default: "border-line bg-control text-foreground enabled:hover:bg-hover",
  primary: "min-w-[87px] border-transparent bg-accent text-white enabled:hover:bg-accent-hover",
  quiet: "border-transparent bg-transparent text-muted enabled:hover:bg-hover",
};

const sizes = {
  default: "min-h-[35px] gap-[7px] rounded-[7px] px-3",
  compact: "min-h-7 gap-[7px] rounded-[7px] px-2 text-xs",
  icon: "min-h-[30px] gap-[7px] rounded-[7px] px-1.5",
};

export function Button({ variant = "default", size = "default", className = "", ...props }: ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return <button className={`inline-flex cursor-pointer items-center justify-center border font-[650] whitespace-nowrap disabled:cursor-default disabled:opacity-[.47] ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
