import { Children, cloneElement, isValidElement } from "react";

import { cn } from "@/lib/cn";

/**
 * Minimal `asChild` implementation: merge our props onto the single child
 * element instead of wrapping it. Lets <Button asChild><Link/></Button> render
 * a real anchor while keeping button styling, without pulling in Radix.
 *
 * The child's own props win, so a caller can still override anything we set —
 * except className, which is merged.
 */
type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};

export function Slot({ children, className, ...props }: SlotProps) {
  const child = Children.only(children);
  if (!isValidElement<React.HTMLAttributes<HTMLElement>>(child)) return null;

  return cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props.className),
  });
}
