import { Fragment, type ReactNode } from "react";
import { Link, useMatches, type UIMatch } from "react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Set `handle: { crumb }` on a route to show it in the breadcrumbs */
export interface RouteHandle {
  crumb?: (match: UIMatch) => ReactNode;
}

export function AppBreadcrumbs() {
  const crumbs = useMatches()
    .filter((match) => (match.handle as RouteHandle | undefined)?.crumb)
    .map((match) => ({
      id: match.id,
      pathname: match.pathname,
      node: (match.handle as RouteHandle).crumb!(match),
    }));

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.id}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="max-w-60 truncate">
                    {crumb.node}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.pathname}>{crumb.node}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
