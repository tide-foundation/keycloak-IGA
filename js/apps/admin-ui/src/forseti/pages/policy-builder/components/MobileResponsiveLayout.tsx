import { useState, useEffect } from "react";
import { Stack, StackItem, Grid, GridItem } from "@patternfly/react-core";

export function MobileResponsiveLayout({ children, breakpoint = 768, stackOnMobile = true }: { children: React.ReactNode[]; breakpoint?: number; stackOnMobile?: boolean; }) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    h(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  if (isMobile && stackOnMobile) {
    return <Stack hasGutter>{children.map((c, i) => <StackItem key={i}>{c}</StackItem>)}</Stack>;
  }
  return <Grid hasGutter>{children.map((c, i) => <GridItem key={i} span={12}>{c}</GridItem>)}</Grid>;
}
