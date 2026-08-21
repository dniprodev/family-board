export type PageLinks = {
  readLink: string;
  editLink: string;
};

export type LinkItem = {
  id: string;
  title: string;
  destinationUrl: string;
  position: number;
};

export type PageResponse = {
  access: "read" | "edit";
  linkItems: LinkItem[];
};
