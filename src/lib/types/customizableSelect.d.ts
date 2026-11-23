import type {DetailedHTMLProps, HTMLAttributes} from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** mirrors the content of the selected option inside the button of a customizable select */
      selectedcontent: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
